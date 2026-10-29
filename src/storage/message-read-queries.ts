import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { buildFtsMatchExpression } from "../shared/fold-vietnamese-for-search.js";
import { reactionSummaries, type ReactionSummary } from "./message-reaction-store.js";
import { parseTextStyles, type TextStyleSpan } from "./message-text-styles.js";
import { getMeta } from "./thread-directory-store.js";

// Danh sách hội thoại tách sang thread-list-queries.ts; xuất lại để chỗ gọi cũ giữ nguyên
export { findThread, listThreads, listThreadsPage, type ThreadSummary } from "./thread-list-queries.js";


export type AttachmentRow = {
  id: number;
  kind: string;
  status: string;
  fileName: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  mime: string | null;
};

export type MessageRow = {
  id: number;
  msgId: string;
  threadId: string;
  threadType: ThreadKind;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
  msgType: string;
  text: string;
  quoteMsgId: string | null;
  sentAt: string;
  recalledAt: string | null;
  source: string;
  /** Định dạng chữ (đậm, màu...) của tin rtf; rỗng với tin chữ thường */
  textStyles: TextStyleSpan[];
  /** Cảm xúc trên tin, gộp theo loại */
  reactions: ReactionSummary[];
  attachments: AttachmentRow[];
};

const MESSAGE_COLUMNS = `m.id, m.msg_id, m.thread_id, m.thread_type, m.sender_id, m.sender_name, m.is_self,
  m.msg_type, m.text, m.quote_msg_id, m.sent_at, m.recalled_at, m.source, c.avatar_url AS sender_avatar_url,
  CASE WHEN m.msg_type = 'webchat' AND json_valid(m.raw_json) AND json_extract(m.raw_json, '$.content.action') = 'rtf'
    THEN json_extract(m.raw_json, '$.content.params') END AS rtf_params`;
/** Avatar người gửi lấy từ danh bạ người */
const SENDER_JOIN = "LEFT JOIN contacts c ON c.user_id = m.sender_id";

/**
 * Tin của một hội thoại theo thứ tự thời gian. Phân trang lùi: `beforeId` là id
 * tin cũ nhất của trang trước, trang này lấy các tin cũ hơn nó.
 */
export function readThread(
  db: DatabaseSync,
  opts: { threadId: string; threadType: ThreadKind; beforeId?: number; limit: number },
): MessageRow[] {
  const cursor = opts.beforeId
    ? (db.prepare("SELECT sent_at, id FROM messages WHERE id = ?").get(opts.beforeId) as
        | { sent_at: string; id: number }
        | undefined)
    : undefined;
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM messages m ${SENDER_JOIN}
       WHERE m.thread_id = :threadId AND m.thread_type = :threadType
         AND (:cursorAt IS NULL OR m.sent_at < :cursorAt OR (m.sent_at = :cursorAt AND m.id < :cursorId))
       ORDER BY m.sent_at DESC, m.id DESC
       LIMIT :limit`,
    )
    .all({
      threadId: opts.threadId,
      threadType: opts.threadType,
      cursorAt: cursor?.sent_at ?? null,
      cursorId: cursor?.id ?? null,
      limit: opts.limit,
    }) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.reverse().map(toMessageRow));
}

/** Tìm toàn văn (bỏ dấu), mới nhất trước. Mốc thời gian là ISO UTC. */
export function searchMessages(
  db: DatabaseSync,
  opts: { query: string; threadId?: string; fromIso?: string; toIso?: string; limit: number },
): MessageRow[] {
  const match = buildFtsMatchExpression(opts.query);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid ${SENDER_JOIN}
       WHERE messages_fts MATCH :match
         AND (:threadId IS NULL OR m.thread_id = :threadId)
         AND (:fromIso IS NULL OR m.sent_at >= :fromIso)
         AND (:toIso IS NULL OR m.sent_at < :toIso)
       ORDER BY m.sent_at DESC, m.id DESC
       LIMIT :limit`,
    )
    .all({
      match,
      threadId: opts.threadId ?? null,
      fromIso: opts.fromIso ?? null,
      toIso: opts.toIso ?? null,
      limit: opts.limit,
    }) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.map(toMessageRow));
}

function toMessageRow(r: Record<string, unknown>): MessageRow {
  return {
    id: Number(r.id),
    msgId: String(r.msg_id),
    threadId: String(r.thread_id),
    threadType: r.thread_type as ThreadKind,
    senderId: String(r.sender_id),
    senderName: (r.sender_name as string | null) ?? null,
    senderAvatarUrl: (r.sender_avatar_url as string | null) ?? null,
    isSelf: r.is_self === 1,
    msgType: String(r.msg_type),
    text: String(r.text),
    quoteMsgId: (r.quote_msg_id as string | null) ?? null,
    sentAt: String(r.sent_at),
    recalledAt: (r.recalled_at as string | null) ?? null,
    source: String(r.source),
    textStyles: parseTextStyles(r.rtf_params as string | null, String(r.text).length),
    reactions: [],
    attachments: [],
  };
}

/** Gắn đính kèm + cảm xúc cho các tin vừa đọc */
function withAttachments(db: DatabaseSync, messages: MessageRow[]): MessageRow[] {
  if (messages.length === 0) return messages;
  const reactions = reactionSummaries(db, messages.map((m) => m.msgId), getMeta(db, "self_uid"));
  for (const m of messages) m.reactions = reactions.get(m.msgId) ?? [];
  const stmt = db.prepare(
    "SELECT id, msg_id, kind, status, file_name, local_path, size_bytes, mime FROM attachments WHERE msg_id = ? ORDER BY id",
  );
  for (const m of messages) {
    m.attachments = (stmt.all(m.msgId) as Array<Record<string, unknown>>).map((a) => ({
      id: Number(a.id),
      kind: String(a.kind),
      status: String(a.status),
      fileName: (a.file_name as string | null) ?? null,
      localPath: (a.local_path as string | null) ?? null,
      sizeBytes: a.size_bytes === null ? null : Number(a.size_bytes),
      mime: (a.mime as string | null) ?? null,
    }));
  }
  return messages;
}
