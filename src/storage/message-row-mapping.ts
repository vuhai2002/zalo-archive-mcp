import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { callNoticeOf } from "../archive/zalo-call-message-text.js";
import { contactCardOf, type ContactCard } from "../archive/zalo-contact-card.js";
import { withZaloEmoticons } from "../archive/zalo-emoticon-emoji.js";
import { linkPreviewOf, type LinkPreview } from "../archive/zalo-link-preview.js";
import { photoAlbumOf, type PhotoAlbum } from "../archive/zalo-photo-album.js";
import { videoInfoOf, type VideoInfo } from "../archive/zalo-video-info.js";
import { parseMentions } from "../archive/zalo-mention-names.js";
import { applyMentionNames, type MentionSource } from "./message-mention-display.js";
import { quotePreviewFromRaw, resolveQuotePreviews, type QuotePreview } from "./message-quote-preview.js";
import { reactionSummaries, type ReactionSummary } from "./message-reaction-store.js";
import { parseTextStyles, type TextStyleSpan } from "./message-text-styles.js";
import { createNoticeRenderer, type NoticeAvatar, type NoticePoll } from "./system-notice-display.js";
import { getMeta } from "./thread-directory-store.js";
import { isZaloDeletedFailure } from "./zalo-deleted-media-store.js";

/**
 * Dựng một dòng tin để hiện (dùng chung cho đọc hội thoại, tìm kiếm, lọc): cột cần đọc, chuyển
 * dòng SQL thành `MessageRow` (mã biểu cảm, cuộc gọi, album, thẻ link), rồi gắn đính kèm + cảm xúc.
 */
export type AttachmentRow = {
  id: number;
  kind: string;
  status: string;
  fileName: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  mime: string | null;
  /** Đang chờ lượt xin Zalo cấp lại link */
  renewPending: boolean;
  /** Đã xin lại link (thành công hay không) */
  renewed: boolean;
  /** Zalo đã xóa file khỏi máy chủ (kho đóng luôn, hoặc Zalo từ chối cấp lại link) - không cứu được */
  zaloDeleted: boolean;
  /** sha256 nội dung file đã tải (null khi chưa tải) - dashboard gắn vào link để bộ nhớ đệm không lẫn */
  sha256: string | null;
};

export type MessageRow = {
  id: number;
  msgId: string;
  threadId: string;
  threadType: ThreadKind;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
  msgType: string;
  text: string;
  quoteMsgId: string | null;
  sentAt: string;
  recalledAt: string | null;
  source: string;
  /** Định dạng chữ (đậm, màu...) của tin rtf; rỗng với tin chữ thường */
  textStyles: TextStyleSpan[];
  /** Tin cuộc gọi (chữ đã dựng sẵn "tiêu đề\nthời lượng"); null với tin khác */
  call: { missedIncoming: boolean } | null;
  /** Ảnh thuộc album (nhiều ảnh gửi cùng lúc) - dashboard gộp thành khung lưới; null với tin khác */
  album: PhotoAlbum | null;
  /** Tin link (recommened.link): chữ của tin + thẻ xem trước (tên trang, mô tả, ảnh, tên miền); null với tin khác */
  link: LinkPreview | null;
  /** Danh thiếp (recommened.user); `threadId` khi người đó có hội thoại 1-1 trong kho */
  contactCard: (ContactCard & { threadId: string | null }) | null;
  /** Tin trả lời: tin gốc để hiện ô trích dẫn (và nhảy tới khi có trong kho) */
  quote: QuotePreview | null;
  /** Tin video: thời lượng + kích thước (vẽ ô đúng tỉ lệ, hiện "00:33"); null với tin khác */
  video: VideoInfo | null;
  /** Thông báo nhóm: 0-4 avatar nhỏ ghép trước câu (người được nhắc tới); rỗng với tin khác */
  noticeAvatars: NoticeAvatar[];
  /** Thông báo nhóm: tổng số người câu nói tới (ô số trên avatar ghép); 0 với tin khác */
  noticePeople: number;
  /** Tin bình chọn: mã cuộc bình chọn + hành động (dựng ở withAttachments) */
  poll: NoticePoll | null;
  /** Cảm xúc trên tin, gộp theo loại */
  reactions: ReactionSummary[];
  attachments: AttachmentRow[];
};

// Tên người gửi như Zalo PC: tên gợi nhớ mình đặt cho họ trước, rồi tên trong tin; tin từ bản sao lưu
// điện thoại không kèm tên người gửi thì lấy tên trong danh bạ người
export const MESSAGE_COLUMNS = `m.id, m.msg_id, m.thread_id, m.thread_type, m.sender_id,
  COALESCE(c.alias, m.sender_name, c.display_name) AS sender_name, m.is_self,
  m.msg_type, m.text, m.quote_msg_id, m.sent_at, m.recalled_at, m.source, c.avatar_url AS sender_avatar_url,
  CASE WHEN m.msg_type = 'webchat' AND json_valid(m.raw_json) AND json_extract(m.raw_json, '$.content.action') = 'rtf'
    THEN json_extract(m.raw_json, '$.content.params') END AS rtf_params,
  CASE WHEN m.msg_type = 'chat.recommended' AND json_valid(m.raw_json)
    THEN json_extract(m.raw_json, '$.content') END AS rec_content,
  CASE WHEN m.msg_type = 'chat.photo' AND json_valid(m.raw_json)
    THEN json_extract(m.raw_json, '$.content.params') END AS photo_params,
  CASE WHEN m.msg_type = 'chat.video.msg' AND json_valid(m.raw_json)
    THEN json_extract(m.raw_json, '$.content.params') END AS video_params,
  CASE WHEN m.msg_type IN ('group_event', 'group.poll') THEN m.raw_json END AS notice_raw,
  CASE WHEN m.quote_msg_id IS NOT NULL AND json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.quote') END AS quote_raw,
  CASE WHEN instr(m.raw_json, '"mentions"') > 0 AND json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.mentions') END AS mentions_raw`;
/** Avatar người gửi lấy từ danh bạ người */
export const SENDER_JOIN = "LEFT JOIN contacts c ON c.user_id = m.sender_id";

// Dữ liệu gốc của thông báo nhóm, giữ tạm từ lúc đọc dòng SQL tới lúc dựng câu (cần danh bạ) trong
// `withAttachments` - không đưa vào MessageRow để khỏi lộ ra API
const noticeRawOf = new WeakMap<MessageRow, string>();
// Dữ liệu trích dẫn Zalo gửi kèm tin trả lời: dựng ô trích dẫn cần mã của mình (biết "Bạn") nên cũng chờ tới đó
const quoteRawOf = new WeakMap<MessageRow, string>();
// Tin có nhắc tên: chữ gốc + định dạng + danh sách nhắc, dựng lại chữ cần danh bạ (tên gợi nhớ) nên cũng chờ tới đó
const mentionSourceOf = new WeakMap<MessageRow, MentionSource>();

export function toMessageRow(r: Record<string, unknown>): MessageRow {
  // Mã biểu cảm (":d") đổi sang emoji lúc đọc, định dạng chữ dời theo; DB giữ chữ gốc
  const shown = withZaloEmoticons(String(r.text), parseTextStyles(r.rtf_params as string | null, String(r.text).length));
  // Tin chat.recommended: cuộc gọi (câu đã dựng sẵn ở text) hoặc thẻ link
  const rec = parseRecommendedContent(r.rec_content);
  const call = callNoticeOf(rec?.action, rec?.params);
  const card = contactCardOf(rec);
  const row: MessageRow = {
    id: Number(r.id),
    msgId: String(r.msg_id),
    threadId: String(r.thread_id),
    threadType: r.thread_type as ThreadKind,
    senderId: String(r.sender_id),
    senderName: (r.sender_name as string | null) ?? null,
    senderAvatarUrl: (r.sender_avatar_url as string | null) ?? null,
    isSelf: r.is_self === 1,
    msgType: String(r.msg_type),
    text: shown.text,
    quoteMsgId: (r.quote_msg_id as string | null) ?? null,
    sentAt: String(r.sent_at),
    recalledAt: (r.recalled_at as string | null) ?? null,
    source: String(r.source),
    textStyles: shown.spans,
    call: call ? { missedIncoming: call.missedIncoming } : null,
    album: photoAlbumOf(r.photo_params),
    link: linkPreviewOf(rec),
    contactCard: card ? { ...card, threadId: null } : null,
    quote: null,
    video: videoInfoOf(r.video_params),
    noticeAvatars: [],
    noticePeople: 0,
    poll: null,
    reactions: [],
    attachments: [],
  };
  if (typeof r.notice_raw === "string") noticeRawOf.set(row, r.notice_raw);
  if (typeof r.quote_raw === "string") quoteRawOf.set(row, r.quote_raw);
  const mentions = parseMentions(r.mentions_raw);
  if (mentions.length > 0) mentionSourceOf.set(row, { text: String(r.text), rtfParams: (r.rtf_params as string | null) ?? null, mentions });
  return row;
}

/** Gắn đính kèm + cảm xúc cho các tin vừa đọc */
export function withAttachments(db: DatabaseSync, messages: MessageRow[]): MessageRow[] {
  if (messages.length === 0) return messages;
  const selfUid = getMeta(db, "self_uid");
  const reactions = reactionSummaries(db, messages.map((m) => m.msgId), selfUid);
  const noticeOf = createNoticeRenderer(db);
  const userThread = db.prepare("SELECT 1 FROM threads WHERE thread_id = ? AND thread_type = 'user'");
  for (const m of messages) {
    m.reactions = reactions.get(m.msgId) ?? [];
    // Thông báo nhóm: câu như Zalo theo danh bạ hiện tại (tên gợi nhớ, tên mới biết), tên in đậm
    const notice = noticeOf(m.msgType, noticeRawOf.get(m) ?? null);
    if (notice) Object.assign(m, { text: notice.text, textStyles: notice.textStyles, noticeAvatars: notice.avatars, noticePeople: notice.people, poll: notice.poll });
    m.quote = quotePreviewFromRaw(quoteRawOf.get(m), selfUid);
    if (m.contactCard && userThread.get(m.contactCard.userId)) m.contactCard.threadId = m.contactCard.userId;
  }
  resolveQuotePreviews(db, messages);
  applyMentionNames(db, messages, (m) => mentionSourceOf.get(m));
  const stmt = db.prepare(
    `SELECT id, msg_id, kind, status, file_name, local_path, size_bytes, mime, needs_renew, renewed_at, last_error, sha256
     FROM attachments WHERE msg_id = ? ORDER BY id`,
  );
  for (const m of messages) {
    m.attachments = (stmt.all(m.msgId) as Array<Record<string, unknown>>).map((a) => ({
      id: Number(a.id),
      kind: String(a.kind),
      status: String(a.status),
      fileName: (a.file_name as string | null) ?? null,
      localPath: (a.local_path as string | null) ?? null,
      sizeBytes: a.size_bytes === null ? null : Number(a.size_bytes),
      mime: (a.mime as string | null) ?? null,
      renewPending: Number(a.needs_renew) === 1,
      renewed: a.renewed_at !== null,
      zaloDeleted: isZaloDeletedFailure(String(a.status), (a.last_error as string | null) ?? null),
      sha256: (a.sha256 as string | null) ?? null,
    }));
  }
  return messages;
}

function parseRecommendedContent(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
