import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

export type DirectoryEntry = { threadId: string; name: string | null };

/**
 * Ghi danh sách bạn bè lấy từ Zalo: tên danh bạ ĐÈ tên lấy từ tin nhắn, và cờ
 * `is_friend` được đặt lại theo đúng danh sách này (ai không còn trong danh sách
 * thì không còn là bạn - cổng gửi dựa vào cờ này).
 *
 * Danh sách rỗng bị bỏ qua: nhiều khả năng là gọi API hỏng chứ không phải người
 * dùng hết bạn, và xóa sạch cờ bạn bè vì một lần gọi hỏng là sai.
 */
export function replaceFriendDirectory(db: DatabaseSync, friends: DirectoryEntry[]): number {
  if (friends.length === 0) return 0;
  const now = new Date().toISOString();
  return inTransaction(db, () => {
    db.prepare("UPDATE threads SET is_friend = 0 WHERE thread_type = 'user' AND is_friend = 1").run();
    const stmt = db.prepare(
      `INSERT INTO threads (thread_id, thread_type, name, is_friend, updated_at) VALUES (?, 'user', ?, 1, ?)
       ON CONFLICT (thread_id, thread_type) DO UPDATE SET
         name = COALESCE(excluded.name, threads.name), is_friend = 1, updated_at = excluded.updated_at`,
    );
    for (const f of friends) stmt.run(f.threadId, f.name, now);
    return friends.length;
  });
}

/** Ghi tên nhóm (tên nhóm có thể đổi nên luôn ghi đè khi có tên mới) */
export function upsertGroupNames(db: DatabaseSync, groups: DirectoryEntry[]): void {
  const now = new Date().toISOString();
  inTransaction(db, () => {
    const stmt = db.prepare(
      `INSERT INTO threads (thread_id, thread_type, name, updated_at) VALUES (?, 'group', ?, ?)
       ON CONFLICT (thread_id, thread_type) DO UPDATE SET
         name = COALESCE(excluded.name, threads.name), updated_at = excluded.updated_at`,
    );
    for (const g of groups) stmt.run(g.threadId, g.name, now);
  });
}

/**
 * Nhóm đã có tin trong kho nhưng chưa biết tên - để hỏi tên theo lô. Nhóm
 * hoạt động gần nhất trước; nhóm đã hỏi mà không ra tên thì chờ tới
 * `retryBeforeIso` mới hỏi lại (không hỏi mãi, không chặn đường nhóm mới).
 */
export function groupsMissingName(db: DatabaseSync, limit: number, retryBeforeIso: string): string[] {
  const rows = db
    .prepare(
      `SELECT thread_id FROM threads
       WHERE thread_type = 'group' AND name IS NULL AND (name_lookup_at IS NULL OR name_lookup_at < ?)
       ORDER BY last_message_at DESC LIMIT ?`,
    )
    .all(retryBeforeIso, limit) as Array<{ thread_id: string }>;
  return rows.map((r) => r.thread_id);
}

export function markGroupNameLookup(db: DatabaseSync, groupIds: string[], atIso: string): void {
  const stmt = db.prepare("UPDATE threads SET name_lookup_at = ? WHERE thread_type = 'group' AND thread_id = ?");
  for (const id of groupIds) stmt.run(atIso, id);
}

export function isFriend(db: DatabaseSync, threadId: string): boolean {
  const row = db
    .prepare("SELECT is_friend FROM threads WHERE thread_id = ? AND thread_type = 'user'")
    .get(threadId) as { is_friend: number } | undefined;
  return row?.is_friend === 1;
}

/**
 * Tên + cờ bạn bè của một hội thoại - RẺ (một dòng theo khóa chính), khác
 * `findThread` vốn đếm cả số tin. Dùng khi phải tra cho nhiều mục một lúc.
 */
export function threadLabel(db: DatabaseSync, threadId: string): { name: string | null; isFriend: boolean } | null {
  const row = db
    .prepare("SELECT name, is_friend FROM threads WHERE thread_id = ? ORDER BY last_message_at DESC LIMIT 1")
    .get(threadId) as { name: string | null; is_friend: number } | undefined;
  return row ? { name: row.name, isFriend: row.is_friend === 1 } : null;
}

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}
