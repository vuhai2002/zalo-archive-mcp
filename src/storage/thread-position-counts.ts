import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";

/**
 * Một trang tin của hội thoại đang ở đâu: tổng số tin, còn bao nhiêu tin cũ hơn tin đầu trang và mới hơn tin cuối trang
 * (cùng thứ tự sent_at, id với read_thread). Để agent biết còn phải đọc tiếp hay đã đủ, không dừng ở trang đầu rồi sót.
 */
export function threadPosition(
  db: DatabaseSync,
  t: { threadId: string; threadType: ThreadKind },
  first: { sentAt: string; id: number },
  last: { sentAt: string; id: number },
): { total: number; older: number; newer: number } {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN sent_at < :firstAt OR (sent_at = :firstAt AND id < :firstId) THEN 1 ELSE 0 END) AS older,
         SUM(CASE WHEN sent_at > :lastAt OR (sent_at = :lastAt AND id > :lastId) THEN 1 ELSE 0 END) AS newer
       FROM messages WHERE thread_id = :threadId AND thread_type = :threadType`,
    )
    .get({ threadId: t.threadId, threadType: t.threadType, firstAt: first.sentAt, firstId: first.id, lastAt: last.sentAt, lastId: last.id }) as {
    total: number;
    older: number | null;
    newer: number | null;
  };
  return { total: r.total, older: r.older ?? 0, newer: r.newer ?? 0 };
}
