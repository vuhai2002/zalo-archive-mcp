import type { ThreadKind } from "../archive/archived-message-types.js";

/** Kiểu của một mục hàng đợi gửi + đổi dòng DB sang kiểu đó (tách khỏi outbox-store cho gọn) */
export type OutboxStatus = "draft" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "rejected";
/** `single`: tin lẻ người dùng bảo gửi; `batch`: một phần của lô gửi nhiều người, đi có nhịp */
export type OutboxMode = "single" | "batch";
export type OutboxCreator = "mcp" | "cli" | "dashboard";
/** Một chỗ nhắc tên (@) trong tin gửi vào nhóm, đúng dạng Zalo cần: vị trí + độ dài đoạn "@Tên" trong chữ (đơn vị ký tự JS) */
export type OutboxMention = { uid: string; pos: number; len: number };
/** File gửi kèm (lệnh send_file): đường dẫn tuyệt đối trên máy, tên hiển thị trên Zalo, cỡ, loại theo đuôi */
export type OutboxFile = { path: string; name: string; size: number; kind: "image" | "video" | "file" };
/** Một đoạn định dạng chữ (đậm, màu, cỡ, danh sách...) đúng dạng `textProperties.styles` của Zalo, xem outbox-text-styles.ts */
export type OutboxTextStyle = { start: number; len: number; st: string };
/**
 * Tin gốc mà tin này trả lời (ô trích dẫn như Zalo), chụp lúc xếp hàng: `messageId` = số tin trong kho, các trường còn lại
 * đúng dạng zca-js `sendMessage({ quote })` cần (mốc `ts` là chuỗi số ms như Zalo gửi).
 */
export type OutboxReplyQuote = {
  messageId: number;
  content: string | Record<string, unknown>;
  msgType: string;
  propertyExt: Record<string, unknown> | undefined;
  uidFrom: string;
  msgId: string;
  cliMsgId: string;
  ts: string;
  ttl: number;
};

export type OutboxItem = {
  id: number;
  threadId: string;
  threadType: ThreadKind;
  text: string;
  mode: OutboxMode;
  batchId: string | null;
  notBefore: string | null;
  status: OutboxStatus;
  createdBy: OutboxCreator;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  sendingStartedAt: string | null;
  finishedAt: string | null;
  sentMsgId: string | null;
  error: string | null;
  /** Nhắc tên (@) gửi kèm; rỗng = tin chữ thường */
  mentions: OutboxMention[];
  /** Tin gốc được trả lời; null = tin thường */
  replyTo: OutboxReplyQuote | null;
  /** Chuyển tiếp tin này (số tin trong kho): daemon gửi bằng API chuyển tiếp; null = tin thường */
  forwardOf: number | null;
  /** File gửi kèm; rỗng = tin chữ */
  files: OutboxFile[];
  /** Định dạng chữ (thanh Định dạng tin nhắn của dashboard); rỗng = chữ thường */
  styles: OutboxTextStyle[];
  /** Thu hồi tin đã gửi: lúc người dùng yêu cầu, lúc Zalo thu hồi xong, lỗi nếu Zalo không cho */
  recallRequestedAt: string | null;
  recalledAt: string | null;
  recallError: string | null;
};

/** Dòng bảng outbox -> OutboxItem */
export function toItem(r: Record<string, unknown>): OutboxItem {
  const s = (k: string) => (r[k] === null || r[k] === undefined ? null : String(r[k]));
  return {
    id: Number(r.id),
    threadId: String(r.thread_id),
    threadType: r.thread_type as ThreadKind,
    text: String(r.text),
    mode: r.mode as OutboxMode,
    batchId: s("batch_id"),
    notBefore: s("not_before"),
    status: r.status as OutboxStatus,
    createdBy: r.created_by as OutboxCreator,
    note: s("note"),
    createdAt: String(r.created_at),
    approvedAt: s("approved_at"),
    sendingStartedAt: s("sending_started_at"),
    finishedAt: s("finished_at"),
    sentMsgId: s("sent_msg_id"),
    error: s("error"),
    mentions: parseMentions(r.mentions_json),
    replyTo: parseReplyTo(r.reply_quote_json),
    forwardOf: r.forward_of_message_id == null ? null : Number(r.forward_of_message_id),
    files: parseFiles(r.files_json),
    styles: parseStyles(r.styles_json),
    recallRequestedAt: s("recall_requested_at"),
    recalledAt: s("recalled_at"),
    recallError: s("recall_error"),
  };
}

function parseMentions(v: unknown): OutboxMention[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const list = JSON.parse(v) as unknown;
    return Array.isArray(list)
      ? list.filter((m): m is OutboxMention => typeof m?.uid === "string" && Number.isInteger(m?.pos) && Number.isInteger(m?.len))
      : [];
  } catch {
    return [];
  }
}

function parseReplyTo(v: unknown): OutboxReplyQuote | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const q = JSON.parse(v) as Partial<OutboxReplyQuote> | null;
    return q && Number.isInteger(q.messageId) && typeof q.msgId === "string" && typeof q.uidFrom === "string" ? (q as OutboxReplyQuote) : null;
  } catch {
    return null;
  }
}

function parseFiles(v: unknown): OutboxFile[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const list = JSON.parse(v) as unknown;
    return Array.isArray(list) ? list.filter((f): f is OutboxFile => typeof f?.path === "string" && typeof f?.name === "string") : [];
  } catch {
    return [];
  }
}

function parseStyles(v: unknown): OutboxTextStyle[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const list = JSON.parse(v) as unknown;
    return Array.isArray(list)
      ? list.filter((s): s is OutboxTextStyle => Number.isInteger(s?.start) && Number.isInteger(s?.len) && typeof s?.st === "string")
      : [];
  } catch {
    return [];
  }
}
