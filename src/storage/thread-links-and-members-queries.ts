import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { MESSAGE_COLUMNS, SENDER_JOIN, toMessageRow } from "./message-row-mapping.js";

/**
 * Hai mục của bảng "Thông tin hội thoại" kiểu Zalo PC ngoài Ảnh/Video và File: Link đã gửi trong hội
 * thoại (thẻ link, hoặc link nằm trong chữ), và Thành viên nhóm (tên gợi nhớ / tên trong danh bạ).
 */
export type SharedLink = { messageId: number; url: string; title: string | null; domain: string; sentAt: string };

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const HAS_URL = "(m.text LIKE '%http://%' OR m.text LIKE '%https://%')";

/** Link http(s) hợp lệ đầu tiên trong chữ (bỏ dấu câu dính cuối); null nếu không có */
export function firstUrlIn(text: string): { url: string; domain: string } | null {
  const raw = URL_IN_TEXT.exec(text)?.[0]?.replace(/[.,;:!?)\]]+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? { url: u.toString(), domain: u.hostname.replace(/^www\./, "") } : null;
  } catch {
    return null;
  }
}

export function threadSharedLinks(
  db: DatabaseSync,
  q: { threadId: string; threadType: ThreadKind; limit: number; offset: number },
): { items: SharedLink[]; total: number } {
  const where = `WHERE m.thread_id = :threadId AND m.thread_type = :threadType AND m.msg_type != 'group_event'
    AND m.recalled_at IS NULL AND ${HAS_URL}`;
  const ref = { threadId: q.threadId, threadType: q.threadType };
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM messages m ${where}`).get(ref) as { n: number }).n;
  const rows = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages m ${SENDER_JOIN} ${where} ORDER BY m.sent_at DESC, m.id DESC LIMIT :limit OFFSET :offset`)
    .all({ ...ref, limit: q.limit, offset: q.offset }) as Array<Record<string, unknown>>;
  const items: SharedLink[] = [];
  for (const r of rows) {
    const m = toMessageRow(r);
    const found = m.link ? { url: m.link.url, domain: m.link.domain } : firstUrlIn(m.text);
    if (found) items.push({ messageId: m.id, ...found, title: m.link?.title ?? null, sentAt: m.sentAt });
  }
  return { items, total };
}

export type ThreadMember = { userId: string; name: string | null; avatarUrl: string | null; isSelf: boolean };

/**
 * Thành viên nhóm theo thứ tự Zalo trả về; ai đã biết tên (tên gợi nhớ / danh bạ) đứng trước - nhóm
 * đông thì kho chỉ hỏi hồ sơ người đã nhắn, nên nhiều thành viên chưa có tên. `total` theo số thành
 * viên Zalo báo nếu có.
 */
export function threadMembers(db: DatabaseSync, q: { groupId: string; limit: number; offset: number }): { members: ThreadMember[]; total: number } {
  const known = (db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(q.groupId) as { n: number }).n;
  const reported = (db.prepare("SELECT member_count FROM threads WHERE thread_id = ? AND thread_type = 'group'").get(q.groupId) as
    | { member_count: number | null }
    | undefined)?.member_count;
  const selfUid = (db.prepare("SELECT value FROM meta WHERE key = 'self_uid'").get() as { value: string } | undefined)?.value ?? null;
  const rows = db
    .prepare(
      `SELECT gm.user_id, COALESCE(c.alias, c.display_name) AS name, c.avatar_url FROM group_members gm
       LEFT JOIN contacts c ON c.user_id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY COALESCE(c.alias, c.display_name) IS NULL, gm.position LIMIT ? OFFSET ?`,
    )
    .all(q.groupId, q.limit, q.offset) as Array<{ user_id: string; name: string | null; avatar_url: string | null }>;
  return {
    total: Math.max(known, reported ?? 0),
    members: rows.map((r) => ({ userId: r.user_id, name: r.name, avatarUrl: r.avatar_url, isSelf: r.user_id === selfUid })),
  };
}
