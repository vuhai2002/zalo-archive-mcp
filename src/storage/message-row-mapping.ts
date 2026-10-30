import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { callNoticeOf } from "../archive/zalo-call-message-text.js";
import { withZaloEmoticons } from "../archive/zalo-emoticon-emoji.js";
import { linkPreviewOf, type LinkPreview } from "../archive/zalo-link-preview.js";
import { photoAlbumOf, type PhotoAlbum } from "../archive/zalo-photo-album.js";
import { withGroupEventMemberNames } from "./group-event-member-names.js";
import { reactionSummaries, type ReactionSummary } from "./message-reaction-store.js";
import { parseTextStyles, type TextStyleSpan } from "./message-text-styles.js";
import { getMeta } from "./thread-directory-store.js";

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
  /** Thẻ link (recommened.link): URL, tiêu đề, mô tả, tên miền; null với tin khác */
  link: LinkPreview | null;
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
    THEN json_extract(m.raw_json, '$.content.params') END AS photo_params`;
/** Avatar người gửi lấy từ danh bạ người */
export const SENDER_JOIN = "LEFT JOIN contacts c ON c.user_id = m.sender_id";

export function toMessageRow(r: Record<string, unknown>): MessageRow {
  // Mã biểu cảm (":d") đổi sang emoji lúc đọc, định dạng chữ dời theo; DB giữ chữ gốc
  const shown = withZaloEmoticons(String(r.text), parseTextStyles(r.rtf_params as string | null, String(r.text).length));
  // Tin chat.recommended: cuộc gọi (câu đã dựng sẵn ở text) hoặc thẻ link
  const rec = parseRecommendedContent(r.rec_content);
  const call = callNoticeOf(rec?.action, rec?.params);
  return {
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
    reactions: [],
    attachments: [],
  };
}

/** Gắn đính kèm + cảm xúc cho các tin vừa đọc */
export function withAttachments(db: DatabaseSync, messages: MessageRow[]): MessageRow[] {
  if (messages.length === 0) return messages;
  const reactions = reactionSummaries(db, messages.map((m) => m.msgId), getMeta(db, "self_uid"));
  for (const m of messages) {
    m.reactions = reactions.get(m.msgId) ?? [];
    m.text = withGroupEventMemberNames(db, m.msgType, m.text);
  }
  const stmt = db.prepare(
    `SELECT id, msg_id, kind, status, file_name, local_path, size_bytes, mime, needs_renew, renewed_at, sha256
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
