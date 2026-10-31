import type { ConnectionEvent, ListenerGap } from "../../archive-api-types";
import type { BadgeTone } from "../../shared/ui-bits";

/**
 * Chọn và đặt tên những gì hai mục kết nối ở Tổng quan hiện, để mục không dài lê thê:
 * - khoảng mất kết nối dưới 2 phút (khởi động lại daemon, chớp mạng; lần nối lại xin bù tin lỡ) gộp
 *   thành một dòng đếm, chỉ khoảng dài hơn mới liệt kê;
 * - sự kiện "Đăng nhập" bỏ khỏi danh sách: luôn đi liền "Đã kết nối" nên chỉ làm dài thêm.
 * Dữ liệu đầy đủ vẫn nằm trong kho và công cụ MCP `sync_status`; đây chỉ là cách hiện.
 */

export const QUICK_GAP_MS = 2 * 60_000;

const durationMs = (g: ListenerGap, nowMs: number) => (g.to ? Date.parse(g.to) : nowMs) - Date.parse(g.from);

/** Khoảng ngắn đã nối lại, không nghi mất tin */
export function isQuickGap(g: ListenerGap, nowMs: number): boolean {
  return g.to !== null && !g.suspected && durationMs(g, nowMs) < QUICK_GAP_MS;
}

/** Lý do ngắn gọn của một khoảng, hiện thành nhãn */
export function gapReason(g: ListenerGap): { label: string; tone: BadgeTone } {
  if (g.suspected) return { label: "Nghi mất tin", tone: "red" };
  if (g.to === null) return { label: "Chưa nối lại", tone: "amber" };
  if (g.asleep) return { label: "Máy ngủ", tone: "gray" };
  if (g.daemonStopped) return { label: "Daemon tắt", tone: "gray" };
  if (g.closeCode !== null) return { label: `Mất mạng · mã ${g.closeCode}`, tone: "gray" };
  return { label: "Mất kết nối", tone: "gray" };
}

/** Sự kiện đáng hiện trong danh sách (bỏ "Đăng nhập") */
export function visibleConnectionEvents(events: ConnectionEvent[]): ConnectionEvent[] {
  return events.filter((e) => e.kind !== "login");
}

/** Ghi chú dài do máy chủ ghi bù đổi thành câu ngắn người đọc hiểu ngay */
export function shortEventDetail(detail: string | null): string | null {
  if (!detail) return null;
  if (detail.startsWith("Tiến trình dừng đột ngột")) return "Daemon tắt (tắt máy / khởi động lại)";
  if (detail.startsWith("Máy ngủ hoặc tiến trình bị treo")) return "Máy ngủ / tiến trình bị treo";
  return detail;
}
