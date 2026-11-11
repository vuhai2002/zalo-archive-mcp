import { formatClock } from "../../shared/format-archive-time";
import { relativeDayLabel } from "../../shared/relative-day-label";

/**
 * Dòng hạn bình chọn trên thẻ như Zalo PC: "Kết thúc lúc 00:00 Ngày mai" (Hôm nay / Ngày mai / Hôm qua, ngày khác thì
 * dd/MM/yyyy); hạn đã qua thì "Đã kết thúc lúc ...". Không có hạn thì null. Module thuần.
 */
export function pollEndTimeLabel(expiresAt: string | null, timeZone: string, now: Date = new Date()): string | null {
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) return null;
  const past = Date.parse(expiresAt) <= now.getTime();
  return `${past ? "Đã kết thúc" : "Kết thúc"} lúc ${formatClock(expiresAt, timeZone)} ${relativeDayLabel(expiresAt, timeZone, now)}`;
}
