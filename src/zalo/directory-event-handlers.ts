import type { DatabaseSync } from "node:sqlite";
import { FriendEventType } from "zca-js";
import { upsertContacts } from "../storage/contact-store.js";
import { addGroupMembers, removeGroupMembers, setGroupMemberCount } from "../storage/group-member-store.js";
import { setFriendFlag, upsertGroupNames } from "../storage/thread-directory-store.js";

/**
 * Cập nhật danh bạ NGAY khi có sự kiện, không chờ lần đồng bộ kế tiếp:
 * - kết bạn / hủy kết bạn: đổi cờ bạn bè (cổng gửi lô dựa vào cờ này);
 * - sự kiện nhóm: tên nhóm, người vào / rời (ảnh ghép avatar nhóm), đổi ảnh nhóm.
 * Payload là của zca-js, đọc phòng thủ: thiếu trường thì bỏ qua.
 */
export function applyFriendEvent(db: DatabaseSync, event: unknown): boolean {
  const e = event as { type?: unknown; data?: unknown; threadId?: unknown } | null;
  if (e?.type !== FriendEventType.ADD && e?.type !== FriendEventType.REMOVE) return false;
  const uid = typeof e.data === "string" && e.data ? e.data : typeof e.threadId === "string" ? e.threadId : null;
  if (!uid) return false;
  setFriendFlag(db, uid, e.type === FriendEventType.ADD);
  return true;
}

const LEAVE_ACTS = new Set(["leave", "remove_member", "block_member"]);

type GroupEventData = {
  groupId?: unknown;
  groupName?: unknown;
  totalMembers?: unknown;
  updateMembers?: Array<{ id?: unknown; dName?: unknown; avatar?: unknown }>;
};

export function applyGroupEvent(db: DatabaseSync, event: unknown): void {
  const e = event as { act?: unknown; data?: GroupEventData } | null;
  const data = e?.data;
  const groupId = typeof data?.groupId === "string" ? data.groupId : null;
  if (!groupId) return;

  const groupName = typeof data?.groupName === "string" && data.groupName.trim() ? data.groupName.trim() : null;
  if (groupName) upsertGroupNames(db, [{ threadId: groupId, name: groupName }]);

  const members = (Array.isArray(data?.updateMembers) ? data.updateMembers : []).filter(
    (m): m is { id: string; dName?: unknown; avatar?: unknown } => typeof m?.id === "string" && m.id !== "",
  );
  if (e?.act === "join" && members.length > 0) {
    addGroupMembers(db, groupId, members.map((m) => m.id));
    upsertContacts(
      db,
      members.map((m) => ({
        userId: m.id,
        displayName: typeof m.dName === "string" && m.dName.trim() ? m.dName.trim() : null,
        avatarUrl: typeof m.avatar === "string" && m.avatar.trim() ? m.avatar.trim() : null,
      })),
    );
  } else if (typeof e?.act === "string" && LEAVE_ACTS.has(e.act) && members.length > 0) {
    removeGroupMembers(db, groupId, members.map((m) => m.id));
  } else if (e?.act === "update_avatar") {
    // Ảnh nhóm đổi: xóa link cũ để vòng hỏi thông tin nhóm lấy link mới ngay
    db.prepare("UPDATE threads SET avatar_url = NULL, name_lookup_at = NULL WHERE thread_id = ? AND thread_type = 'group'").run(
      groupId,
    );
  }
  if (typeof data?.totalMembers === "number") setGroupMemberCount(db, groupId, data.totalMembers);
}
