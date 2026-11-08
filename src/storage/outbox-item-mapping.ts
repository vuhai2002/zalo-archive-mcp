import type { ThreadKind } from "../archive/archived-message-types.js";

/** Kiểu của một mục hàng đợi gửi + đổi dòng DB sang kiểu đó (tách khỏi outbox-store cho gọn) */
export type OutboxStatus = "draft" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "rejected";
/** `single`: tin lẻ người dùng bảo gửi; `batch`: một phần của lô gửi nhiều người, đi có nhịp */
export type OutboxMode = "single" | "batch";
export type OutboxCreator = "mcp" | "cli" | "dashboard";
/** Một chỗ nhắc tên (@) trong tin gửi vào nhóm, đúng dạng Zalo cần: vị trí + độ dài đoạn "@Tên" trong chữ (đơn vị ký tự JS) */
export type OutboxMention = { uid: string; pos: number; len: number };

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
