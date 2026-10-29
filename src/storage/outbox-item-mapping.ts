import type { ThreadKind } from "../archive/archived-message-types.js";

/** Kiểu của một mục hàng đợi gửi + đổi dòng DB sang kiểu đó (tách khỏi outbox-store cho gọn) */
export type OutboxStatus = "draft" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "rejected";
/** `single`: tin lẻ người dùng bảo gửi; `batch`: một phần của lô gửi nhiều người, đi có nhịp */
export type OutboxMode = "single" | "batch";
export type OutboxCreator = "mcp" | "cli" | "dashboard";

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
  };
}
