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

/**
 * Nhãn "Zalo đã gửi bù khoảng này chưa" (máy chủ gắn `backfill`): đủ thì yên tâm, có thể thiếu thì chỉ cách lấy lại, chưa rõ
 * (khoảng trước khi kho ghi kết quả lấy bù) thì kèm số tin kho đang có. `title` là chữ hiện khi rê chuột.
 */
export function gapBackfillBadge(g: ListenerGap): { label: string; tone: BadgeTone; title: string } | null {
  const inGap = g.messagesInGap ?? 0;
  if (g.backfill === "filled") {
    return { label: `Đã lấy bù đủ · ${inGap} tin`, tone: "green", title: `Zalo đã gửi lại hết tin lỡ (${g.backfillItems ?? 0} tin). Kho có ${inGap} tin trong khoảng này.` };
  }
  if (g.backfill === "incomplete") {
    return {
      label: "Có thể thiếu tin",
      tone: "amber",
      title: `${g.backfillDetail ?? "Lấy bù dừng dở"}. Kho có ${inGap} tin trong khoảng này. Lấy lại bằng đồng bộ từ điện thoại (Cài đặt > Đồng bộ và sao lưu).`,
    };
  }
  if (g.backfill === "unknown") {
    return {
      label: `Chưa rõ đã lấy bù · ${inGap} tin`,
      tone: "gray",
      title: `Khoảng này chưa có kết quả lấy bù được ghi. Kho có ${inGap} tin trong khoảng này. Muốn chắc chắn: đồng bộ từ điện thoại ngày đó (Cài đặt > Đồng bộ và sao lưu).`,
    };
  }
  if (g.backfill === "synced") {
    return { label: `Đã đồng bộ từ điện thoại · ${inGap} tin`, tone: "green", title: `Một lượt đồng bộ từ điện thoại đã phủ trọn khoảng này. Kho có ${inGap} tin trong khoảng này.` };
  }
  return null;
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
