/**
 * Khoảng ngày của bộ lọc "Ngày gửi" (ngày theo múi giờ kho, dạng YYYY-MM-DD như API nhận). Module thuần.
 */
export type DateRange = { from: string; to: string; label: string };
export type DatePreset = "today" | "7d" | "30d";

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Hôm nay" },
  { id: "7d", label: "7 ngày qua" },
  { id: "30d", label: "30 ngày qua" },
];

/** Cộng / trừ ngày trên chuỗi YYYY-MM-DD (tính theo lịch, không dính múi giờ máy) */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** "7 ngày qua" = hôm nay và 6 ngày trước đó */
export function presetRange(id: DatePreset, today: string): DateRange {
  const back = id === "today" ? 0 : id === "7d" ? 6 : 29;
  return { from: shiftDate(today, -back), to: today, label: DATE_PRESETS.find((p) => p.id === id)!.label };
}

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Khoảng tự chọn: đảo lại nếu chọn ngược; nhãn "12/10 - 20/10" (một ngày thì "12/10") */
export function customRange(a: string, b: string): DateRange {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return { from, to, label: from === to ? dm(from) : `${dm(from)} - ${dm(to)}` };
}
