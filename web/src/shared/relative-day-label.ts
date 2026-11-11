import { dayKey, formatDayMonthYear } from "./format-archive-time";

/**
 * Ngày nói gần như Zalo PC: "Hôm nay", "Ngày mai", "Hôm qua", ngày khác thì "dd/MM/yyyy" (theo múi giờ kho). Dùng cho
 * hạn bình chọn ("Kết thúc lúc 00:00 Ngày mai") và giờ nhắc hẹn ("Hôm nay lúc 10:15"). Module thuần.
 */
export function relativeDayLabel(iso: string, timeZone: string, now: Date = new Date()): string {
  const key = dayKey(iso, timeZone);
  const shift = (days: number) => dayKey(new Date(now.getTime() + days * 86_400_000).toISOString(), timeZone);
  if (key === shift(0)) return "Hôm nay";
  if (key === shift(1)) return "Ngày mai";
  if (key === shift(-1)) return "Hôm qua";
  return formatDayMonthYear(iso, timeZone);
}

const WEEKDAYS = ["CHỦ NHẬT", "THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY"];

/** Ô lịch của thẻ nhắc hẹn như Zalo PC: "THỨ TƯ" / "11" / "THÁNG 11" (theo múi giờ kho) */
export function calendarTileParts(iso: string, timeZone: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = dayKey(iso, timeZone).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  return { weekday, day: String(d), month: `THÁNG ${m}` };
}
