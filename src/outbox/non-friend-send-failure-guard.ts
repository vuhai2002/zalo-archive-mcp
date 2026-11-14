import type { DatabaseSync } from "node:sqlite";
import { markSendFailed, type OutboxItem } from "../storage/outbox-store.js";
import { setKillSwitch } from "../storage/send-control-store.js";
import { isFriend } from "../storage/thread-directory-store.js";

/** Số NGƯỜI chưa kết bạn khác nhau gửi hỏng liền nhau thì bật khóa khẩn cấp */
export const NON_FRIEND_FAILURE_LIMIT = 3;
const STREAK_SCAN_LIMIT = 50;

/**
 * Ghi một lần gửi hỏng và quyết định có bật khóa khẩn cấp không (người dùng chốt 2026-11-14).
 * - Tin 1-1 tới người CHƯA kết bạn: họ có thể không nhận tin người lạ, chặn mình... - lỗi của riêng người đó, chỉ đánh hỏng
 *   tin này. Nhưng NON_FRIEND_FAILURE_LIMIT người khác nhau hỏng liền nhau thì nhiều khả năng chính nick bị Zalo giới hạn
 *   nhắn người lạ: bật khóa, gửi tiếp chỉ hỏng thêm.
 * - Tin tới bạn bè / nhóm: lỗi đầu tiên bật khóa như cũ.
 */
export function recordSendFailure(db: DatabaseSync, item: OutboxItem, message: string): { killed: boolean } {
  if (item.threadType === "group" || isFriend(db, item.threadId)) {
    markSendFailed(db, item.id, message);
    setKillSwitch(db, true, `Lỗi khi gửi #${item.id}: ${message}`);
    return { killed: true };
  }
  markSendFailed(db, item.id, `Không gửi được tới người chưa kết bạn: ${message}`);
  if (failingNonFriendsInARow(db).size < NON_FRIEND_FAILURE_LIMIT) return { killed: false };
  setKillSwitch(
    db,
    true,
    `${NON_FRIEND_FAILURE_LIMIT} người chưa kết bạn liền nhau gửi hỏng (gần nhất #${item.id}: ${message}) - có thể nick đang bị Zalo giới hạn nhắn người lạ`,
  );
  return { killed: true };
}

/**
 * Những người chưa kết bạn trong chuỗi lần gửi hỏng liền nhau mới nhất (chỉ xét lần gửi tới người chưa kết bạn đã thật sự
 * gọi Zalo), dừng ở lần gửi được gần nhất.
 */
function failingNonFriendsInARow(db: DatabaseSync): Set<string> {
  const rows = db
    .prepare(
      `SELECT o.thread_id, o.status FROM outbox o
       LEFT JOIN threads t ON t.thread_id = o.thread_id AND t.thread_type = 'user'
       WHERE o.thread_type = 'user' AND COALESCE(t.is_friend, 0) = 0
         AND o.sending_started_at IS NOT NULL AND o.status IN ('sent', 'failed')
       ORDER BY o.sending_started_at DESC, o.id DESC LIMIT ?`,
    )
    .all(STREAK_SCAN_LIMIT) as Array<{ thread_id: string; status: string }>;
  const people = new Set<string>();
  for (const r of rows) {
    if (r.status !== "failed") break;
    people.add(r.thread_id);
  }
  return people;
}
