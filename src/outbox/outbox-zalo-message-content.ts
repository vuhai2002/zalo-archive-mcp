import type { ForwardMessageResponse, MessageContent, SendMessageQuote, Style } from "zca-js";
import type { OutboxMention, OutboxReplyQuote, OutboxTextStyle } from "../storage/outbox-item-mapping.js";

/**
 * Nội dung đưa cho zca-js `sendMessage`: chữ trơn khi không có gì thêm; có nhắc tên (@) thì kèm danh sách nhắc (Zalo mới
 * tô xanh và báo cho người được nhắc); trả lời một tin thì kèm tin gốc (Zalo hiện ô trích dẫn phía trên tin mới); có định
 * dạng thì kèm `styles` - zca-js chuyển nguyên mã (đã kiểm ở hàng đợi) sang `textProperties` như Zalo tự gửi.
 */
export function toZaloMessage(text: string, mentions: OutboxMention[], replyTo: OutboxReplyQuote | null, styles: OutboxTextStyle[] = []): string | MessageContent {
  if (mentions.length === 0 && !replyTo && styles.length === 0) return text;
  const content: MessageContent = { msg: text };
  // Mã thụt lề đã ở dạng cuối "ind_20": zca-js chỉ đổi mã "ind_$" nên để nguyên được
  if (styles.length > 0) content.styles = styles as unknown as Style[];
  if (mentions.length > 0) content.mentions = mentions;
  if (replyTo) content.quote = toZaloQuote(replyTo);
  return content;
}

function toZaloQuote(q: OutboxReplyQuote): SendMessageQuote {
  return {
    content: q.content,
    msgType: q.msgType,
    propertyExt: q.propertyExt,
    uidFrom: q.uidFrom,
    msgId: q.msgId,
    cliMsgId: q.cliMsgId,
    ts: q.ts,
    ttl: q.ttl,
  } as SendMessageQuote;
}

/**
 * Kết quả API chuyển tiếp của Zalo cho MỘT nơi nhận -> mã tin. Zalo báo lỗi riêng từng nơi trong `fail` (không ném lỗi), nên
 * phải tự đọc: có lỗi thì ném để vòng gửi đánh hỏng + bật kill switch như mọi lần gửi hỏng.
 */
export function forwardedMsgId(res: ForwardMessageResponse): { msgId: string | null } {
  const fail = res.fail?.[0];
  if (fail) throw new Error(`Zalo từ chối chuyển tiếp (mã lỗi ${fail.error_code})`);
  const msgId = res.success?.[0]?.msgId;
  return { msgId: msgId === undefined || msgId === null ? null : String(msgId) };
}
