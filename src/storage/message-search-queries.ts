import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { buildFtsMatchExpression } from "../shared/fold-vietnamese-for-search.js";
import { MESSAGE_COLUMNS, SENDER_JOIN, toMessageRow, withAttachments, type MessageRow } from "./message-row-mapping.js";

export type MessageSearchOptions = {
  /** Từ khóa (tìm toàn văn, bỏ dấu); trống thì phải có người gửi hoặc khoảng ngày */
  query?: string;
  threadId?: string;
  senderId?: string;
  /** Mốc thời gian ISO UTC: từ (gồm) - tới (không gồm) */
  fromIso?: string;
  toIso?: string;
  /** "only": chỉ tin có file; "exclude": bỏ tin có file (mục Tin nhắn và mục File của kết quả tìm tách riêng) */
  files?: "only" | "exclude";
  limit: number;
  offset?: number;
};

const HAS_FILE = "EXISTS (SELECT 1 FROM attachments a WHERE a.msg_id = m.msg_id AND a.kind = 'file')";
const PAGE = "ORDER BY m.sent_at DESC, m.id DESC LIMIT :limit OFFSET :offset";

/**
 * Tìm tin, mới nhất trước: theo từ khóa và / hoặc lọc theo hội thoại, người gửi, khoảng ngày, có file
 * hay không. Không từ khóa mà cũng không lọc người gửi / ngày thì trả rỗng (không liệt kê cả kho).
 */
export function searchMessages(db: DatabaseSync, opts: MessageSearchOptions): MessageRow[] {
  const raw = opts.query?.trim() ?? "";
  const match = raw ? buildFtsMatchExpression(raw) : null;
  if (raw && !match) return [];
  if (!match && !opts.senderId && !opts.fromIso && !opts.toIso) return [];

  // node:sqlite từ chối tham số đặt tên thừa: chỉ thêm tham số khi SQL thật sự dùng nó
  const where: string[] = [];
  const params: Record<string, SQLInputValue> = { limit: opts.limit, offset: opts.offset ?? 0 };
  const add = (cond: string, name?: string, value?: SQLInputValue) => {
    where.push(cond);
    if (name !== undefined) params[name] = value ?? null;
  };
  if (match) add("messages_fts MATCH :match", "match", match);
  if (opts.threadId) add("m.thread_id = :threadId", "threadId", opts.threadId);
  if (opts.senderId) add("m.sender_id = :senderId", "senderId", opts.senderId);
  if (opts.fromIso) add("m.sent_at >= :fromIso", "fromIso", opts.fromIso);
  if (opts.toIso) add("m.sent_at < :toIso", "toIso", opts.toIso);
  if (opts.files === "only") add(HAS_FILE);
  if (opts.files === "exclude") add(`NOT ${HAS_FILE}`);
  // Tin hệ thống của nhóm ("X đã thêm Y") không phải tin ai gửi
  if (!match) add("m.msg_type != 'group_event'");

  const from = match ? `messages_fts f JOIN messages m ON m.id = f.rowid` : "messages m";
  const rows = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${from} ${SENDER_JOIN} WHERE ${where.join(" AND ")} ${PAGE}`)
    .all(params) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.map(toMessageRow));
}

/** Tin người khác nhắc tới mình (@tên mình, hoặc @Tất cả trong nhóm), mới nhất trước */
export function listMessagesMentioningMe(
  db: DatabaseSync,
  opts: { selfUid: string | null; limit: number; offset?: number },
): MessageRow[] {
  if (!opts.selfUid) return [];
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM messages m ${SENDER_JOIN}
       WHERE m.is_self = 0 AND instr(m.raw_json, '"mentions"') > 0 AND json_valid(m.raw_json)
         AND json_type(m.raw_json, '$.mentions') = 'array'
         AND EXISTS (SELECT 1 FROM json_each(m.raw_json, '$.mentions') j
                     WHERE CAST(json_extract(j.value, '$.uid') AS TEXT) = :self OR json_extract(j.value, '$.type') = 1)
       ${PAGE}`,
    )
    .all({ self: opts.selfUid, limit: opts.limit, offset: opts.offset ?? 0 }) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.map(toMessageRow));
}

/** Tin của mình được người khác thả cảm xúc, tin vừa được thả gần nhất trước */
export function listMyMessagesWithReactions(
  db: DatabaseSync,
  opts: { selfUid: string | null; limit: number; offset?: number },
): MessageRow[] {
  if (!opts.selfUid) return [];
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}, MAX(t.reacted_at) AS last_reacted_at
       FROM messages m ${SENDER_JOIN}
       JOIN message_reaction_taps t ON t.msg_id = m.msg_id AND t.reactor_id != :self AND t.icon != ''
       WHERE m.is_self = 1
       GROUP BY m.id
       ORDER BY last_reacted_at DESC, m.id DESC LIMIT :limit OFFSET :offset`,
    )
    .all({ self: opts.selfUid, limit: opts.limit, offset: opts.offset ?? 0 }) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.map(toMessageRow));
}

export type ThreadSender = { senderId: string; name: string | null; avatarUrl: string | null; isSelf: boolean; count: number };

/** Những người đã gửi tin trong hội thoại (cho bộ lọc "Người gửi"), gửi nhiều nhất trước */
export function threadSenders(db: DatabaseSync, threadId: string, limit = 500): ThreadSender[] {
  const rows = db
    .prepare(
      `SELECT m.sender_id, MAX(m.is_self) AS is_self, COUNT(*) AS n,
         COALESCE(MAX(c.alias), MAX(c.display_name), MAX(m.sender_name)) AS name, MAX(c.avatar_url) AS avatar_url
       FROM messages m LEFT JOIN contacts c ON c.user_id = m.sender_id
       WHERE m.thread_id = ? AND m.msg_type != 'group_event'
       GROUP BY m.sender_id ORDER BY n DESC LIMIT ?`,
    )
    .all(threadId, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    senderId: String(r.sender_id),
    name: (r.name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isSelf: Number(r.is_self) === 1,
    count: Number(r.n),
  }));
}
