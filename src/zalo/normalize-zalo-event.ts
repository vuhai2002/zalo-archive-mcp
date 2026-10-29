import type { NormalizedMessage, NormalizedRecall, ThreadKind } from "../archive/archived-message-types.js";
import { attachmentKindOf, extractMessageAttachments } from "./extract-message-attachments.js";
import { callNoticeOf } from "../archive/zalo-call-message-text.js";
import { zaloTimestampToIso } from "./zalo-message-timestamp.js";

/**
 * Hình dạng tin THÔ mà kho ghi vào nhật ký và chuẩn hóa từ đó. Cố tình là object
 * phẳng (không phải class của zca-js) để chạy lại từ nhật ký JSONL được y hệt.
 *
 * `data` là `message.data` của zca-js: `uidFrom`/`idTo` đã được lib đổi "0" thành
 * uid của mình, nên `isSelf` phải lấy từ cờ của lib chứ không so `uidFrom`.
 */
export type RawListenerMessage = {
  threadType: ThreadKind;
  threadId: string;
  isSelf: boolean;
  data: Record<string, unknown>;
};

const LINK_TYPES = new Set(["chat.recommended", "chat.recommend", "chat.link", "share.link"]);

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** Tin này thực chất là lệnh thu hồi (có trong `old_messages`, lib không tách ra như tin live) */
export function isRecallPayload(data: Record<string, unknown>): boolean {
  const c = data.content;
  return !!c && typeof c === "object" && !Array.isArray(c) && "deleteMsg" in c;
}

/**
 * Thẻ thông báo của Zalo (vd `chat.list.action` "Đăng nhập Zalo trên máy tính thành công"):
 * `content` là MẢNG thẻ - thẻ đầu có tiêu đề + mô tả, các thẻ sau là nút bấm chỉ dùng được
 * trong app (vd "Mở lịch sử đăng nhập") nên không lấy.
 */
function cardListText(msgType: string, cards: unknown[]): string {
  for (const card of cards) {
    if (!card || typeof card !== "object") continue;
    const c = card as Record<string, unknown>;
    const text = [str(c.title), str(c.description)].filter(Boolean).join("\n");
    if (text) return text;
  }
  return `[${msgType}]`;
}

/** Chữ hiển thị cho tin: chữ thật, caption, hoặc mô tả ngắn cho tin không có chữ */
function messageText(msgType: string, content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return cardListText(msgType, content);
  if (!content || typeof content !== "object") return `[${msgType}]`;
  const c = content as Record<string, unknown>;
  const title = str(c.title);
  const description = str(c.description);

  if (LINK_TYPES.has(msgType)) {
    const call = callNoticeOf(c.action, c.params);
    if (call) return `${call.title}\n${call.detail}`;
    // Chỉ dán URL thì Zalo đặt cùng URL vào cả tiêu đề, link lẫn mô tả: mỗi phần chỉ hiện một lần
    const parts = [title, str(c.href), description].filter((p): p is string => !!p);
    return [...new Set(parts)].join("\n") || `[${msgType}]`;
  }
  if (msgType === "chat.sticker") return "[sticker]";
  if (attachmentKindOf(msgType) === "file") return ""; // tên file nằm ở đính kèm
  return [title, description].filter(Boolean).join("\n") || (attachmentKindOf(msgType) ? "" : `[${msgType}]`);
}

/** Trả null khi payload thiếu id (không khử trùng được thì không ghi) */
export function normalizeMessage(raw: RawListenerMessage, receivedAt: Date): NormalizedMessage | null {
  const d = raw.data;
  const msgId = str(d.msgId);
  const threadId = str(raw.threadId);
  if (!msgId || !threadId) return null;
  const msgType = str(d.msgType) ?? "unknown";
  const quote = d.quote && typeof d.quote === "object" ? (d.quote as Record<string, unknown>) : null;
  const attachments = extractMessageAttachments(msgType, d.content);
  const text = messageText(msgType, d.content);

  return {
    msgId,
    cliMsgId: str(d.cliMsgId),
    threadId,
    threadType: raw.threadType,
    senderId: str(d.uidFrom) ?? "unknown",
    senderName: str(d.dName),
    isSelf: raw.isSelf,
    msgType,
    // Tin media mà không rút được URL thì vẫn phải để lại dấu vết đọc được
    text: text === "" && attachments.length === 0 ? `[${msgType}]` : text,
    quoteMsgId: quote ? str(quote.globalMsgId) : null,
    sentAt: zaloTimestampToIso(d.ts, receivedAt),
    attachments,
    rawJson: JSON.stringify(d),
  };
}

/** Lệnh thu hồi: id tin bị thu hồi nằm ở `content.globalMsgId` */
export function normalizeRecall(raw: RawListenerMessage, receivedAt: Date): NormalizedRecall | null {
  const content = raw.data.content as Record<string, unknown> | undefined;
  const target = content ? str(content.globalMsgId) : null;
  const threadId = str(raw.threadId);
  if (!target || !threadId) return null;
  return {
    msgId: target,
    threadId,
    recalledBy: str(raw.data.uidFrom) ?? "unknown",
    recalledAt: zaloTimestampToIso(raw.data.ts, receivedAt),
    rawJson: JSON.stringify(raw.data),
  };
}
