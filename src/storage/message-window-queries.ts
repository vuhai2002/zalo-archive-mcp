import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { readThread } from "./message-read-queries.js";
import { MESSAGE_COLUMNS, SENDER_JOIN, toMessageRow, withAttachments, type MessageRow } from "./message-row-mapping.js";

type ThreadRef = { threadId: string; threadType: ThreadKind };

/**
 * Tin MỚI hơn một tin (hoặc từ chính tin đó nếu `inclusive`), thứ tự thời gian tăng dần - để cuộn xuống
 * tải tiếp sau khi nhảy tới một tin cũ từ kết quả tìm kiếm.
 */
export function readThreadAfter(
  db: DatabaseSync,
  opts: ThreadRef & { afterId: number; limit: number; inclusive?: boolean },
): MessageRow[] {
  const cursor = db.prepare("SELECT sent_at, id FROM messages WHERE id = ?").get(opts.afterId) as
    | { sent_at: string; id: number }
    | undefined;
  if (!cursor) return [];
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM messages m ${SENDER_JOIN}
       WHERE m.thread_id = :threadId AND m.thread_type = :threadType
         AND (m.sent_at > :cursorAt OR (m.sent_at = :cursorAt AND m.id ${opts.inclusive ? ">=" : ">"} :cursorId))
       ORDER BY m.sent_at, m.id
       LIMIT :limit`,
    )
    .all({
      threadId: opts.threadId,
      threadType: opts.threadType,
      cursorAt: cursor.sent_at,
      cursorId: cursor.id,
      limit: opts.limit,
    }) as Array<Record<string, unknown>>;
  return withAttachments(db, rows.map(toMessageRow));
}

/**
 * Một trang tin quanh một tin (nửa trang cũ hơn, rồi chính tin đó và phần mới hơn), thứ tự tăng dần.
 * null khi tin không thuộc hội thoại này.
 */
export function readThreadAround(
  db: DatabaseSync,
  opts: ThreadRef & { messageId: number; limit: number },
): MessageRow[] | null {
  const own = db
    .prepare("SELECT 1 FROM messages WHERE id = ? AND thread_id = ? AND thread_type = ?")
    .get(opts.messageId, opts.threadId, opts.threadType);
  if (!own) return null;
  const older = readThread(db, { ...opts, beforeId: opts.messageId, limit: Math.floor(opts.limit / 2) });
  const rest = readThreadAfter(db, { ...opts, afterId: opts.messageId, limit: opts.limit - older.length, inclusive: true });
  return [...older, ...rest];
}
