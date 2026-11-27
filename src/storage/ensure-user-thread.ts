import type { DatabaseSync } from "node:sqlite";
import { upsertContacts } from "./contact-store.js";

/**
 * Thêm người vào kho (dòng `threads` 1-1 + danh bạ) để mở được hội thoại và xếp tin gửi tới họ, dù chưa có tin nào: dùng khi
 * tra số ra người, khi bấm "Nhắn tin" trên danh thiếp. Hội thoại chưa có tin nên KHÔNG hiện trong danh sách hội thoại; tên đã
 * có (bạn bè, tên đặt sẵn) không bị đè, cờ bạn bè giữ nguyên.
 */
export function ensureUserThread(
  db: DatabaseSync,
  user: { uid: string; name: string | null; avatarUrl: string | null },
  nowIso: string,
  opts: { keepKnownContact?: boolean } = {},
): void {
  db.prepare(
    `INSERT INTO threads (thread_id, thread_type, name, is_friend, updated_at) VALUES (?, 'user', ?, 0, ?)
     ON CONFLICT (thread_id, thread_type) DO UPDATE SET name = COALESCE(threads.name, excluded.name), updated_at = excluded.updated_at`,
  ).run(user.uid, user.name, nowIso);
  // Danh thiếp có thể đã cũ: người đã có trong danh bạ thì giữ tên / avatar đang có
  if (opts.keepKnownContact && db.prepare("SELECT 1 FROM contacts WHERE user_id = ?").get(user.uid)) return;
  // `upsertContacts` tự mở giao dịch riêng (không lồng được trong giao dịch của người gọi): gọi sau cùng
  upsertContacts(db, [{ userId: user.uid, displayName: user.name, avatarUrl: user.avatarUrl }]);
}
