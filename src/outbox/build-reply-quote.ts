import type { DatabaseSync } from "node:sqlite";
import type { OutboxReplyQuote } from "../storage/outbox-item-mapping.js";
import type { ThreadSummary } from "../storage/message-read-queries.js";

/**
 * Tin gửi đi dạng TRẢ LỜI một tin (như vuốt / bấm "Trả lời" trên Zalo): tin mới mang ô trích dẫn tin gốc.
 * Dựng sẵn lúc xếp hàng đợi, từ bản tin gốc kho đã lưu, đúng dạng zca-js `sendMessage({ quote })` cần, rồi lưu
 * cùng mục hàng đợi: daemon gửi theo bản chụp này, tin gốc có đổi sau đó (bị thu hồi...) cũng không lệch.
 */
type Row = {
  thread_id: string;
  msg_id: string;
  cli_msg_id: string | null;
  sender_id: string;
  msg_type: string;
  text: string | null;
  sent_at: string;
  recalled_at: string | null;
  raw_json: string | null;
};

/** Loại tin Zalo không cho trả lời kèm trích dẫn (zca-js từ chối bình chọn) hoặc không phải tin của ai */
const NOT_QUOTABLE: Record<string, string> = {
  "group.poll": "bình chọn",
  group_event: "thông báo nhóm",
};

function parseRaw(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Nội dung trích dẫn: tin chữ phải là chuỗi (tin chữ dài Zalo lưu dạng { title }); tin ảnh / file / link giữ nguyên đối tượng */
function quoteContent(msgType: string, raw: Record<string, unknown>, text: string | null): string | Record<string, unknown> {
  const c = raw.content;
  if (msgType !== "webchat" && c && typeof c === "object") return c as Record<string, unknown>;
  if (typeof c === "string") return c;
  const title = c && typeof c === "object" ? (c as Record<string, unknown>).title : null;
  return typeof title === "string" ? title : (text ?? "");
}

/** Số ms của mốc thời gian tin gốc (Zalo ghi `ts` dạng chuỗi số; thiếu thì lấy giờ gửi kho đã lưu) */
function quoteTs(raw: Record<string, unknown>, sentAt: string): string {
  const ts = Number(raw.ts);
  return String(Number.isFinite(ts) && ts > 0 ? ts : Date.parse(sentAt));
}

/** `messageId` = số tin trong kho (#N ở read_thread). Lỗi khi tin không thuộc hội thoại này hoặc không trả lời được */
export function buildReplyQuote(db: DatabaseSync, thread: ThreadSummary, messageId: number): { quote: OutboxReplyQuote } | { error: string } {
  const row = db
    .prepare("SELECT thread_id, msg_id, cli_msg_id, sender_id, msg_type, text, sent_at, recalled_at, raw_json FROM messages WHERE id = ?")
    .get(messageId) as Row | undefined;
  if (!row || row.thread_id !== thread.threadId) {
    return { error: `Không thấy tin #${messageId} trong hội thoại thread_id=${thread.threadId} (lấy số tin ở read_thread).` };
  }
  if (row.recalled_at) return { error: `Tin #${messageId} đã bị thu hồi - không trả lời được.` };
  const notQuotable = NOT_QUOTABLE[row.msg_type];
  if (notQuotable) return { error: `Tin #${messageId} là ${notQuotable} - Zalo không cho trả lời kèm trích dẫn.` };

  const raw = parseRaw(row.raw_json);
  const msgType = typeof raw.msgType === "string" ? raw.msgType : row.msg_type;
  const cliMsgId = row.cli_msg_id ?? (raw.cliMsgId == null ? "" : String(raw.cliMsgId));
  return {
    quote: {
      messageId,
      content: quoteContent(msgType, raw, row.text),
      msgType,
      propertyExt: raw.propertyExt && typeof raw.propertyExt === "object" ? (raw.propertyExt as Record<string, unknown>) : undefined,
      uidFrom: typeof raw.uidFrom === "string" && raw.uidFrom !== "0" ? raw.uidFrom : row.sender_id,
      msgId: row.msg_id,
      cliMsgId,
      ts: quoteTs(raw, row.sent_at),
      ttl: Number(raw.ttl) || 0,
    },
  };
}
