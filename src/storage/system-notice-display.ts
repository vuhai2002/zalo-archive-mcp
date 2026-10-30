import type { DatabaseSync } from "node:sqlite";
import { systemNoticeOf } from "../archive/zalo-system-notice.js";
import type { TextStyleSpan } from "./message-text-styles.js";
import { getMeta } from "./thread-directory-store.js";

/**
 * Thông báo nhóm (tin `group_event`) dựng LẠI lúc đọc từ dữ liệu gốc đã lưu, theo danh bạ hiện tại:
 * lúc nhận sự kiện có thể chưa biết tên thành viên (chữ lưu mang mã số) và tên gợi nhớ đặt sau
 * cũng phải hiện. Câu, chỗ in đậm và avatar lấy từ `zalo-system-notice.ts`; dựng không được (dữ liệu
 * lạ) thì giữ chữ đã lưu.
 */
export type NoticeAvatar = { userId: string | null; name: string | null; url: string | null };
export type DisplayedNotice = { text: string; textStyles: TextStyleSpan[]; avatar: NoticeAvatar | null };

const boldSpan = (s: { start: number; end: number }): TextStyleSpan => ({
  ...s,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  size: null,
});

/** Chuẩn bị truy vấn danh bạ một lần, dùng cho cả loạt tin */
export function createNoticeRenderer(db: DatabaseSync): (msgType: string, rawJson: string | null) => DisplayedNotice | null {
  let contact: ReturnType<DatabaseSync["prepare"]> | null = null;
  let selfUid: string | null | undefined;
  const lookup = (uid: string) => {
    contact ??= db.prepare("SELECT COALESCE(alias, display_name) AS name, avatar_url FROM contacts WHERE user_id = ?");
    return contact.get(uid) as { name: string | null; avatar_url: string | null } | undefined;
  };
  return (msgType, rawJson) => {
    if (msgType !== "group_event") return null;
    if (selfUid === undefined) selfUid = getMeta(db, "self_uid");
    const notice = systemNoticeOf(rawJson, { selfUid, nameOf: (uid) => lookup(uid)?.name ?? null });
    if (!notice) return null;
    const who = notice.avatar?.userId ? lookup(notice.avatar.userId) : undefined;
    const avatar = notice.avatar
      ? { userId: notice.avatar.userId, name: who?.name ?? null, url: who?.avatar_url ?? notice.avatar.url }
      : null;
    return { text: notice.text, textStyles: notice.bold.map(boldSpan), avatar };
  };
}
