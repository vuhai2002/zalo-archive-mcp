import type { AttachmentInfo, OutboxItem, OutboxStatus } from "../archive-api-types";
import type { BadgeTone } from "./ui-bits";

/**
 * Nhãn tiếng Việt cho các mã trạng thái server trả về. Mã lạ (server thêm
 * trạng thái mới mà web chưa biết) thì hiện nguyên mã thay vì để trống.
 */
function lookup(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

const MEDIA_STATUS: Record<AttachmentInfo["status"], string> = {
  pending: "Chờ tải",
  downloading: "Đang tải",
  done: "Đã tải",
  failed: "Tải hỏng",
  too_large: "Quá cỡ, không tải",
  blocked_host: "Máy chủ file bị chặn",
  removed: "Đã xóa file khỏi kho",
};
export const mediaStatusLabel = (status: string) => lookup(MEDIA_STATUS, status);

const SOURCE: Record<string, string> = {
  live: "Trực tiếp",
  old_messages: "Lịch sử cũ",
  mobile_sync: "Đồng bộ điện thoại",
  journal_replay: "Phát lại nhật ký",
};
export const sourceLabel = (source: string) => lookup(SOURCE, source);

const OUTBOX_STATUS: Record<OutboxStatus, string> = {
  draft: "Nháp",
  approved: "Chờ gửi",
  sending: "Đang gửi",
  sent: "Đã gửi",
  failed: "Lỗi",
  cancelled: "Đã hủy",
  rejected: "Bị từ chối",
};
export const outboxStatusLabel = (status: string) => lookup(OUTBOX_STATUS, status);

const OUTBOX_TONE: Record<OutboxStatus, BadgeTone> = {
  draft: "gray",
  approved: "blue",
  sending: "amber",
  sent: "green",
  failed: "red",
  cancelled: "gray",
  rejected: "red",
};
export const outboxStatusTone = (status: OutboxStatus): BadgeTone => OUTBOX_TONE[status] ?? "gray";

const CREATED_BY: Record<OutboxItem["createdBy"], string> = {
  mcp: "Claude (MCP)",
  cli: "Dòng lệnh",
  dashboard: "Dashboard",
};
export const createdByLabel = (by: string) => lookup(CREATED_BY, by);

const EVENT_KIND: Record<string, { label: string; tone: BadgeTone }> = {
  login: { label: "Đăng nhập", tone: "blue" },
  connected: { label: "Đã kết nối", tone: "green" },
  closed: { label: "Mất kết nối", tone: "amber" },
  error: { label: "Lỗi", tone: "red" },
  gave_up: { label: "Bỏ cuộc", tone: "red" },
  stopped: { label: "Đã dừng", tone: "gray" },
};
export function eventKindInfo(kind: string): { label: string; tone: BadgeTone } {
  return EVENT_KIND[kind] ?? { label: kind, tone: "gray" };
}
