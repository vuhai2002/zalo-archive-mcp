import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * Danh bạ NGƯỜI (khác `threads` là danh sách hội thoại): tên + avatar của bạn bè,
 * người lạ đã nhắn, thành viên nhóm đã gửi tin. Dùng để hiện avatar ở danh sách
 * hội thoại và ở từng tin nhóm.
 */
export type ContactEntry = { userId: string; displayName: string | null; avatarUrl: string | null };

/** Số thành viên đầu nhóm dùng để ghép ảnh cho nhóm không có ảnh riêng (danh sách hội thoại) */
export const GROUP_MOSAIC_MEMBERS = 4;

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
  // Mã số người không phải tên: lưu vào thì tên thật về sau không đè được nữa
  if (displayName?.trim() === userId) displayName = null;
  db.prepare(
    `INSERT INTO contacts (user_id, display_name, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(contacts.display_name, excluded.display_name)`,
  ).run(userId, displayName, new Date().toISOString());
}

/**
 * Người chưa có avatar và chưa hỏi gần đây (trước `retryBeforeIso`) - để hỏi Zalo theo lô. Chỉ
 * những người kho thật sự cần hiện: đã gửi tin, người kia của hội thoại 1-1, và vài thành viên
 * đầu của nhóm chưa có ảnh (dashboard ghép ảnh nhóm từ họ). Thành viên khác của nhóm đông thì
 * không hỏi: hỏi cả nhóm là hàng nghìn người, Zalo chặn ngay (mã 221).
 */
export function contactsNeedingLookup(db: DatabaseSync, limit: number, retryBeforeIso: string): string[] {
  const rows = db
    .prepare(
      `SELECT c.user_id FROM contacts c
       WHERE c.avatar_url IS NULL AND (c.lookup_at IS NULL OR c.lookup_at < :retryBefore)
         AND (EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = c.user_id)
           OR EXISTS (SELECT 1 FROM threads t WHERE t.thread_type = 'user' AND t.thread_id = c.user_id)
           OR EXISTS (SELECT 1 FROM group_members gm JOIN threads g ON g.thread_id = gm.group_id AND g.thread_type = 'group'
                      WHERE gm.user_id = c.user_id AND gm.position < :mosaic AND g.avatar_url IS NULL))
       ORDER BY c.updated_at DESC LIMIT :limit`,
    )
    .all({ retryBefore: retryBeforeIso, mosaic: GROUP_MOSAIC_MEMBERS, limit }) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

/** Đánh dấu đã hỏi (thành công hay không) để không hỏi lại ngay */
export function markContactLookup(db: DatabaseSync, userIds: string[], atIso: string): void {
  const stmt = db.prepare("UPDATE contacts SET lookup_at = ? WHERE user_id = ?");
  for (const id of userIds) stmt.run(atIso, id);
}
