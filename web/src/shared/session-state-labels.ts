import type { SessionState, SessionStatus } from "../archive-api-types";
import { formatClock } from "./format-archive-time";
import type { BadgeTone } from "./ui-bits";

/** Nhãn tiếng Việt cho từng trạng thái phiên Zalo - dùng chung sidebar + trang Tài khoản */
export const SESSION_STATE_LABEL: Record<SessionState, string> = {
  logged_out: "Chưa đăng nhập",
  qr_pending: "Đang chờ quét QR",
  logging_in: "Đang đăng nhập",
  running: "Đang chạy",
  stopped: "Đã dừng",
  gave_up: "Mất kết nối, cần đăng nhập lại",
  error: "Lỗi đăng nhập",
};

/**
 * Màu tổng hợp của phiên. "running" mà listener chưa nối thì KHÔNG xanh: đã
 * đăng nhập nhưng không nhận tin nào - chính là lúc kho đang hụt tin.
 */
export function sessionTone(s: SessionStatus | null): BadgeTone {
  if (!s) return "gray";
  switch (s.state) {
    case "running":
      return s.listenerConnected ? "green" : "amber";
    case "qr_pending":
    case "logging_in":
      return "amber";
    case "gave_up":
    case "error":
      return "red";
    default:
      return "gray";
  }
}

/** Câu ngắn cho chân sidebar */
export function sessionShortText(s: SessionStatus | null): string {
  if (!s) return "Chưa rõ phiên";
  if (s.state === "running") return s.listenerConnected ? "Đang nghe tin" : "Mất kết nối listener";
  return SESSION_STATE_LABEL[s.state];
}

export const TONE_DOT_CLASS: Record<BadgeTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-zalo-500",
  gray: "bg-slate-300 dark:bg-slate-600",
};

/**
 * Listener đang chờ tự nối lại (Zalo vừa đóng kết nối): "Zalo đóng kết nối (mã 3000 - NOT_AUTHENTICATED),
 * kho tự nối lại lúc 08:30". null khi không ở tình huống đó (đang kết nối, đã dừng, cần đăng nhập lại...).
 */
export function listenerRetryText(s: SessionStatus | null, timeZone: string): string | null {
  if (!s || s.state !== "running" || s.listenerConnected || !s.listenerRetryAt) return null;
  const why = s.listenerCloseCode !== null ? ` (mã ${s.listenerCloseCode}${s.listenerCloseReason ? ` - ${s.listenerCloseReason}` : ""})` : "";
  return `Zalo đóng kết nối nghe tin${why}, kho tự nối lại lúc ${formatClock(s.listenerRetryAt, timeZone)}`;
}
