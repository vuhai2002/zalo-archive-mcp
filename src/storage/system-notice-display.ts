import type { DatabaseSync } from "node:sqlite";
import { POLL_MSG_TYPE, pollEventFromRawJson, pollNoticeOf } from "../archive/zalo-poll-notice.js";
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
/** Tin bình chọn: mã cuộc bình chọn (mở cửa sổ Xem) + hành động (create / vote / update / close / share) */
export type NoticePoll = { pollId: string; action: string };
/** `avatars`: 0-4 avatar ghép trước câu như Zalo PC; `people`: tổng số người câu nói tới (ô số trên avatar ghép) */
export type DisplayedNotice = { text: string; textStyles: TextStyleSpan[]; avatars: NoticeAvatar[]; people: number; poll: NoticePoll | null };

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
    if (msgType !== "group_event" && msgType !== POLL_MSG_TYPE) return null;
    if (selfUid === undefined) selfUid = getMeta(db, "self_uid");
    const names = { selfUid, nameOf: (uid: string) => lookup(uid)?.name ?? null };
    // Tin bình chọn: "X tham gia cuộc bình chọn: <câu hỏi>" (tên, câu hỏi in đậm) + mã để mở cửa sổ Xem
    if (msgType === POLL_MSG_TYPE) {
      const ev = pollEventFromRawJson(rawJson);
      if (!ev) return null;
      const n = pollNoticeOf(ev, names);
      return { text: n.text, textStyles: n.bold.map(boldSpan), avatars: [], people: 0, poll: { pollId: ev.pollId, action: ev.action } };
    }
    const notice = systemNoticeOf(rawJson, names);
    if (!notice) return null;
    const avatars = notice.avatars.map((a) => {
      const who = a.userId ? lookup(a.userId) : undefined;
      return { userId: a.userId, name: who?.name ?? null, url: who?.avatar_url ?? a.url };
    });
    return { text: notice.text, textStyles: notice.bold.map(boldSpan), avatars, people: notice.people, poll: null };
  };
}
