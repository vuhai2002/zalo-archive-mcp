import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { withZaloEmoticons } from "../archive/zalo-emoticon-emoji.js";
import { withGroupEventMemberNames } from "./group-event-member-names.js";

/**
 * Phần thêm cho danh sách hội thoại kiểu Zalo trên dashboard: tin cuối (để hiện
 * "Bạn: 📎 file.mp4") và avatar vài thành viên nhóm (ghép avatar khi nhóm không có
 * ảnh riêng). Tách khỏi `thread-list-queries` để MCP không tốn thêm truy vấn.
 */
export type LastMessagePreview = {
  isSelf: boolean;
  senderName: string | null;
  msgType: string;
  text: string;
  attachmentKind: string | null;
  attachmentName: string | null;
  recalled: boolean;
};

export type MemberAvatar = { userId: string; name: string | null; avatarUrl: string | null };

export function lastMessagePreview(db: DatabaseSync, threadId: string, threadType: ThreadKind): LastMessagePreview | null {
  const row = db
    .prepare(
      `SELECT m.msg_id, m.is_self, m.msg_type, m.text, m.recalled_at,
         COALESCE(m.sender_name, (SELECT display_name FROM contacts c WHERE c.user_id = m.sender_id)) AS sender_name,
         (SELECT kind FROM attachments a WHERE a.msg_id = m.msg_id ORDER BY a.id LIMIT 1) AS att_kind,
         (SELECT file_name FROM attachments a WHERE a.msg_id = m.msg_id ORDER BY a.id LIMIT 1) AS att_name
       FROM messages m WHERE m.thread_id = ? AND m.thread_type = ?
       ORDER BY m.sent_at DESC, m.id DESC LIMIT 1`,
    )
    .get(threadId, threadType) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    isSelf: row.is_self === 1,
    senderName: (row.sender_name as string | null) ?? null,
    msgType: String(row.msg_type),
    // Chữ dài chỉ cần đoạn đầu cho dòng xem trước; mã biểu cảm (":d") hiện thành emoji, mã số
    // thành viên trong sự kiện nhóm thành tên - như khung chat
    text: withZaloEmoticons(withGroupEventMemberNames(db, String(row.msg_type), String(row.text)).slice(0, 200)).text,
    attachmentKind: (row.att_kind as string | null) ?? null,
    attachmentName: (row.att_name as string | null) ?? null,
    recalled: row.recalled_at !== null,
  };
}

/**
 * Avatar để ghép ảnh nhóm, theo THÀNH VIÊN THẬT của nhóm (thứ tự Zalo trả về) +
 * tổng số thành viên. Nhóm chưa lấy được danh sách thành viên thì tạm dùng những
 * người đã nhắn gần nhất cộng chính mình.
 */
export function groupMemberAvatars(
  db: DatabaseSync,
  groupId: string,
  limit: number,
): { memberAvatars: MemberAvatar[]; memberCount: number | null } {
  const countRow = db
    .prepare("SELECT member_count FROM threads WHERE thread_id = ? AND thread_type = 'group'")
    .get(groupId) as { member_count: number | null } | undefined;
  const memberCount = countRow?.member_count ?? null;
  const fromMembers = db
    .prepare(
      `SELECT gm.user_id, c.display_name, c.avatar_url FROM group_members gm
       LEFT JOIN contacts c ON c.user_id = gm.user_id
       WHERE gm.group_id = ? ORDER BY gm.position LIMIT ?`,
    )
    .all(groupId, limit) as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }>;
  if (fromMembers.length > 0) {
    return { memberAvatars: fromMembers.map((r) => ({ userId: r.user_id, name: r.display_name, avatarUrl: r.avatar_url })), memberCount };
  }
  return { memberAvatars: recentSendersWithSelf(db, groupId, limit), memberCount };
}

function recentSendersWithSelf(db: DatabaseSync, groupId: string, limit: number): MemberAvatar[] {
  const rows = db
    .prepare(
      `SELECT m.sender_id, MAX(m.sent_at) AS last_at, c.display_name, c.avatar_url
       FROM messages m LEFT JOIN contacts c ON c.user_id = m.sender_id
       WHERE m.thread_id = ? AND m.thread_type = 'group'
       GROUP BY m.sender_id ORDER BY last_at DESC LIMIT ?`,
    )
    .all(groupId, limit) as Array<{ sender_id: string; display_name: string | null; avatar_url: string | null }>;
  const members = rows.map((r) => ({ userId: r.sender_id, name: r.display_name, avatarUrl: r.avatar_url }));
  const self = db
    .prepare("SELECT c.user_id, c.display_name, c.avatar_url FROM meta m JOIN contacts c ON c.user_id = m.value WHERE m.key = 'self_uid'")
    .get() as { user_id: string; display_name: string | null; avatar_url: string | null } | undefined;
  if (self && members.length < limit && !members.some((m) => m.userId === self.user_id)) {
    members.push({ userId: self.user_id, name: self.display_name, avatarUrl: self.avatar_url });
  }
  return members;
}
