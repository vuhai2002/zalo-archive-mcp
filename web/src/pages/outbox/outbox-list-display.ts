import type { OutboxItem, OutboxListResponse, OutboxStatus } from "../../archive-api-types";
import { dayKey, formatClock, formatDateTime } from "../../shared/format-archive-time";
import { chatDayLabel } from "../threads/message-grouping";

/**
 * Quy tắc hiển thị trang Hàng đợi (thuần, test được): tab + số đếm, nhóm tin theo ngày tạo như dải ngày của Zalo, dòng
 * trạng thái kèm giờ ở góc phải mỗi tin, tin nào cần người dùng xử lý (nháp chờ duyệt, gửi lỗi) thì tô nền.
 */

export type OutboxTab = { key: string; label: string; statuses: OutboxStatus[]; showCount: boolean };

/** "Lỗi" gom cả `rejected` (cổng gửi từ chối, vd trễ quá hạn) - với người dùng cả hai đều là "không gửi được" */
export const OUTBOX_TABS: OutboxTab[] = [
  { key: "all", label: "Tất cả", statuses: [], showCount: false },
  { key: "draft", label: "Nháp", statuses: ["draft"], showCount: true },
  { key: "approved", label: "Chờ gửi", statuses: ["approved"], showCount: false },
  { key: "sending", label: "Đang gửi", statuses: ["sending"], showCount: false },
  { key: "sent", label: "Đã gửi", statuses: ["sent"], showCount: false },
  { key: "failed", label: "Lỗi", statuses: ["failed", "rejected"], showCount: true },
  { key: "cancelled", label: "Đã hủy", statuses: ["cancelled"], showCount: false },
];

/** Số trên tab (chỉ tab cần xử lý: Nháp, Lỗi); 0 thì không hiện */
export function tabCount(tab: OutboxTab, counts: OutboxListResponse["counts"] | null): number {
  if (!tab.showCount || !counts) return 0;
  return tab.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
}

export type DayGroup = { key: string; label: string; items: OutboxItem[] };

/** Gom theo ngày tạo (danh sách đã xếp mới nhất trước): "Hôm nay", "Hôm qua", "Thứ Năm, 12/03/2026" */
export function groupByDay(items: OutboxItem[], tz: string, now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const it of items) {
    const key = dayKey(it.createdAt, tz);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(it);
    else groups.push({ key, label: chatDayLabel(it.createdAt, tz, now), items: [it] });
  }
  return groups;
}

export type StatusTone = "amber" | "blue" | "green" | "red" | "gray";
export type StatusIcon = "draft" | "clock" | "check" | "error" | "recall" | "cancel";
export type StatusLine = { text: string; tone: StatusTone; icon: StatusIcon };

/** Giờ ngắn nếu cùng ngày tạo (đã có dải ngày phía trên), không thì kèm ngày */
function timeNear(iso: string | null, createdAt: string, tz: string): string {
  if (!iso) return "";
  return dayKey(iso, tz) === dayKey(createdAt, tz) ? formatClock(iso, tz) : formatDateTime(iso, tz);
}

/** Chữ trạng thái góc phải mỗi tin, như "Đã gửi 20:11", "Gửi lúc 08:00 10/11", "Nháp chờ duyệt" */
export function statusLine(it: OutboxItem, tz: string, now: Date = new Date()): StatusLine {
  const at = (iso: string | null) => timeNear(iso, it.createdAt, tz);
  const join = (label: string, iso: string | null) => [label, at(iso)].filter(Boolean).join(" ");
  if (it.recalledAt) return { text: join("Đã thu hồi", it.recalledAt), tone: "gray", icon: "recall" };
  if (it.recallRequestedAt && !it.recallError) return { text: "Đang thu hồi...", tone: "amber", icon: "recall" };
  switch (it.status) {
    case "draft":
      return { text: "Nháp chờ duyệt", tone: "amber", icon: "draft" };
    case "approved":
      return it.notBefore && Date.parse(it.notBefore) > now.getTime()
        ? { text: `Gửi lúc ${at(it.notBefore)}`, tone: "blue", icon: "clock" }
        : { text: "Chờ gửi", tone: "blue", icon: "clock" };
    case "sending":
      return { text: "Đang gửi...", tone: "blue", icon: "clock" };
    case "sent":
      return { text: join("Đã gửi", it.finishedAt), tone: "green", icon: "check" };
    case "failed":
      return { text: join("Lỗi", it.finishedAt), tone: "red", icon: "error" };
    case "rejected":
      return { text: join("Bị từ chối", it.finishedAt), tone: "red", icon: "error" };
    default:
      return { text: join("Đã hủy", it.finishedAt), tone: "gray", icon: "cancel" };
  }
}

/** Tin cần người dùng làm gì đó: nháp chờ duyệt (nền vàng), gửi lỗi / bị từ chối (nền đỏ) */
export function attention(it: OutboxItem): "warning" | "danger" | null {
  if (it.status === "draft") return "warning";
  if (it.status === "failed" || it.status === "rejected") return "danger";
  return null;
}

/** Nhãn loại tin cạnh tên hội thoại */
export function modeLabel(it: OutboxItem): string {
  return it.mode === "batch" ? "Gửi lô" : it.forwarded ? "Chuyển tiếp" : "Tin lẻ";
}
