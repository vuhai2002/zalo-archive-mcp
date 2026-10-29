import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * Danh bạ NGƯỜI (khác `threads` là danh sách hội thoại): tên + avatar của bạn bè,
 * người lạ đã nhắn, thành viên nhóm đã gửi tin. Dùng để hiện avatar ở danh sách
 * hội thoại và ở từng tin nhóm.
 */
export type ContactEntry = { userId: string; displayName: string | null; avatarUrl: string | null };

/** Ghi thông tin lấy từ Zalo (danh sách bạn, hồ sơ): giá trị mới đè giá trị cũ khi có */
export function upsertContacts(db: DatabaseSync, entries: ContactEntry[]): void {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  inTransaction(db, () => {
    const stmt = db.prepare(
      `INSERT INTO contacts (user_id, display_name, avatar_url, updated_at, lookup_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, contacts.display_name),
         avatar_url = COALESCE(excluded.avatar_url, contacts.avatar_url),
         updated_at = excluded.updated_at, lookup_at = excluded.lookup_at`,
    );
    for (const e of entries) stmt.run(e.userId, e.displayName, e.avatarUrl, now, now);
  });
}

/**
 * Ghi nhận một người vừa xuất hiện trong tin (chưa có avatar) - không đè thông tin
 * đã có. Gọi lúc ghi tin, nằm sẵn trong giao dịch của người gọi.
 */
export function noteContactSeen(db: DatabaseSync, userId: string, displayName: string | null): void {
  db.prepare(
    `INSERT INTO contacts (user_id, display_name, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(contacts.display_name, excluded.display_name)`,
  ).run(userId, displayName, new Date().toISOString());
}

/** Người chưa có avatar và chưa hỏi gần đây (trước `retryBeforeIso`) - để hỏi Zalo theo lô */
export function contactsNeedingLookup(db: DatabaseSync, limit: number, retryBeforeIso: string): string[] {
  const rows = db
    .prepare(
      `SELECT user_id FROM contacts WHERE avatar_url IS NULL AND (lookup_at IS NULL OR lookup_at < ?)
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(retryBeforeIso, limit) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

/** Đánh dấu đã hỏi (thành công hay không) để không hỏi lại ngay */
export function markContactLookup(db: DatabaseSync, userIds: string[], atIso: string): void {
  const stmt = db.prepare("UPDATE contacts SET lookup_at = ? WHERE user_id = ?");
  for (const id of userIds) stmt.run(atIso, id);
}
