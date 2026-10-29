import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { buildFtsMatchExpression, foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";

export type ThreadSummary = {
  threadId: string;
  threadType: ThreadKind;
  name: string | null;
  isFriend: boolean;
  lastMessageAt: string | null;
  messageCount: number;
};

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
  isSelf: boolean;
  msgType: string;
  text: string;
  quoteMsgId: string | null;
  sentAt: string;
  recalledAt: string | null;
  source: string;
  attachments: AttachmentRow[];
};

/** Danh sách hội thoại, mới nhất trước. `query` lọc theo tên (bỏ dấu) hoặc đúng id. */
export function listThreads(db: DatabaseSync, opts: { query?: string; limit: number }): ThreadSummary[] {
  return listThreadsPage(db, { ...opts, offset: 0 }).threads;
}

/** Như `listThreads` nhưng có phân trang và tổng số (cho dashboard) */
export function listThreadsPage(
  db: DatabaseSync,
  opts: { query?: string; limit: number; offset: number },
): { threads: ThreadSummary[]; total: number } {
  // Lọc tên bằng JS vì cần bỏ dấu cả hai phía; vài nghìn hội thoại vẫn nhanh.
  const rows = db
    .prepare(
      `SELECT thread_id, thread_type, name, is_friend, last_message_at FROM threads
       ORDER BY last_message_at IS NULL, last_message_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;

  const raw = opts.query?.trim() ?? "";
  const needle = foldVietnameseForSearch(raw);
  const filtered = raw
    ? rows.filter((r) => r.thread_id === raw || foldVietnameseForSearch(String(r.name ?? "")).includes(needle))
    : rows;
  const page = filtered.slice(opts.offset, opts.offset + opts.limit).map((r) => toThreadSummary(db, r));
  return { threads: page, total: filtered.length };
}

/** Hội thoại theo đúng id; null nếu kho chưa từng thấy hội thoại này */
export function findThread(db: DatabaseSync, threadId: string): ThreadSummary | null {
  const row = db
    .prepare(
      `SELECT thread_id, thread_type, name, is_friend, last_message_at FROM threads
       WHERE thread_id = ? ORDER BY last_message_at DESC LIMIT 1`,
    )
    .get(threadId) as Record<string, unknown> | undefined;
  return row ? toThreadSummary(db, row) : null;
}

function toThreadSummary(db: DatabaseSync, r: Record<string, unknown>): ThreadSummary {
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE thread_id = ? AND thread_type = ?")
    .get(String(r.thread_id), String(r.thread_type)) as { n: number };
  return {
    threadId: String(r.thread_id),
    threadType: r.thread_type as ThreadKind,
    name: (r.name as string | null) ?? null,
    isFriend: r.is_friend === 1,
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    messageCount: Number(count.n),
  };
}

const MESSAGE_COLUMNS = `m.id, m.msg_id, m.thread_id, m.thread_type, m.sender_id, m.sender_name, m.is_self,
  m.msg_type, m.text, m.quote_msg_id, m.sent_at, m.recalled_at, m.source`;

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
      `SELECT ${MESSAGE_COLUMNS} FROM messages m
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
      `SELECT ${MESSAGE_COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid
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
    isSelf: r.is_self === 1,
    msgType: String(r.msg_type),
    text: String(r.text),
    quoteMsgId: (r.quote_msg_id as string | null) ?? null,
    sentAt: String(r.sent_at),
    recalledAt: (r.recalled_at as string | null) ?? null,
    source: String(r.source),
    attachments: [],
  };
}

function withAttachments(db: DatabaseSync, messages: MessageRow[]): MessageRow[] {
  if (messages.length === 0) return messages;
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
