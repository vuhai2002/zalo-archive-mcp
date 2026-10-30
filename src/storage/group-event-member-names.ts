import type { DatabaseSync } from "node:sqlite";

/**
 * Chữ của sự kiện nhóm ("X đã rời nhóm") dựng lúc nhận sự kiện; khi đó danh bạ có thể chưa biết
 * tên thành viên nên chữ mang mã số ("2160000000000000101 đã rời nhóm"). Lúc đọc, đổi các mã số
 * đó sang tên trong danh bạ nếu đã có (chưa có thì giữ mã). Chỉ áp cho tin `group_event`: tin chữ
 * thường có dãy số dài (mã đơn, số tài khoản) không bị đụng.
 */
const UID_IN_TEXT = /\b\d{15,20}\b/g;

export function withGroupEventMemberNames(db: DatabaseSync, msgType: string, text: string): string {
  if (msgType !== "group_event" || !UID_IN_TEXT.test(text)) return text;
  UID_IN_TEXT.lastIndex = 0;
  const nameOf = db.prepare("SELECT COALESCE(alias, display_name) AS display_name FROM contacts WHERE user_id = ?");
  return text.replace(UID_IN_TEXT, (uid) => (nameOf.get(uid) as { display_name: string | null } | undefined)?.display_name ?? uid);
}
