import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * Thành viên của nhóm theo Zalo (không phải "ai đã nhắn"): dùng để ghép avatar
 * nhóm như Zalo, gồm cả người chưa từng nhắn. Thứ tự giữ theo danh sách Zalo trả về.
 */

/** Ghi lại TOÀN BỘ danh sách thành viên (từ thông tin nhóm) + tổng số thành viên */
export function replaceGroupMembers(db: DatabaseSync, groupId: string, userIds: string[], total: number | null): void {
  inTransaction(db, () => {
    db.prepare("DELETE FROM group_members WHERE group_id = ?").run(groupId);
    const stmt = db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, position) VALUES (?, ?, ?)");
    userIds.forEach((id, i) => stmt.run(groupId, id, i));
    db.prepare("UPDATE threads SET member_count = ? WHERE thread_id = ? AND thread_type = 'group'").run(
      total ?? userIds.length,
      groupId,
    );
  });
}

/** Có người vào nhóm: thêm vào cuối danh sách */
export function addGroupMembers(db: DatabaseSync, groupId: string, userIds: string[]): void {
  const row = db.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM group_members WHERE group_id = ?").get(groupId) as {
    p: number;
  };
  const stmt = db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, position) VALUES (?, ?, ?)");
  userIds.forEach((id, i) => stmt.run(groupId, id, row.p + 1 + i));
}

/** Có người rời / bị mời ra khỏi nhóm */
export function removeGroupMembers(db: DatabaseSync, groupId: string, userIds: string[]): void {
  const stmt = db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?");
  for (const id of userIds) stmt.run(groupId, id);
}

export function setGroupMemberCount(db: DatabaseSync, groupId: string, total: number): void {
  db.prepare("UPDATE threads SET member_count = ? WHERE thread_id = ? AND thread_type = 'group'").run(total, groupId);
}
