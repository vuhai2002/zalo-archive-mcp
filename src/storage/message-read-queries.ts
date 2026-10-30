import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { MESSAGE_COLUMNS, SENDER_JOIN, toMessageRow, withAttachments, type MessageRow } from "./message-row-mapping.js";

// Danh sách hội thoại tách sang thread-list-queries.ts, dựng dòng tin sang message-row-mapping.ts,
// tìm / lọc tin sang message-search-queries.ts; xuất lại để chỗ gọi cũ giữ nguyên
export { findThread, listThreads, listThreadsPage, type ThreadSummary } from "./thread-list-queries.js";
export type { AttachmentRow, MessageRow } from "./message-row-mapping.js";
export { searchMessages } from "./message-search-queries.js";

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
