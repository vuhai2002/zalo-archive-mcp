import type { DatabaseSync } from "node:sqlite";
import { DateTime } from "luxon";
import { randomGapMs } from "../outbox/send-policy.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";

export type RenewPacing = { minGapSeconds: number; maxGapSeconds: number; dailyCap: number; timeZone: string };

type ScheduleState = { lastSlotAt: string | null; day: string; used: number };

const META_KEY = "media_renew_schedule";

function readState(db: DatabaseSync): ScheduleState {
  try {
    const s = JSON.parse(getMeta(db, META_KEY) ?? "") as Partial<ScheduleState>;
    return { lastSlotAt: typeof s.lastSlotAt === "string" ? s.lastSlotAt : null, day: String(s.day ?? ""), used: Number(s.used) || 0 };
  } catch {
    return { lastSlotAt: null, day: "", used: 0 };
  }
}

const dayKey = (ms: number, tz: string) => DateTime.fromMillis(ms, { zone: tz }).toISODate() ?? "";
const startOfNextDay = (ms: number, tz: string) => DateTime.fromMillis(ms, { zone: tz }).startOf("day").plus({ days: 1 }).toMillis();

/**
 * Cấp "lượt" (mốc giờ) xin lại link cho một file: các lượt cách nhau ngẫu nhiên trong
 * [min, max] giây, mỗi ngày (giờ kho) tối đa `dailyCap` lượt, quá trần thì sang ngày sau.
 * Đồng bộ lịch sử ra hàng nghìn ảnh cũ thì việc xin lại rải ra nhiều ngày, không dồn dập.
 * Trạng thái nằm trong bảng meta: khởi động lại không đếm trần lại từ đầu.
 */
export function allocateRenewSlot(db: DatabaseSync, pacing: RenewPacing, now: Date, random: () => number = Math.random): Date {
  const state = readState(db);
  let at = now.getTime();
  if (state.lastSlotAt) at = Math.max(at, Date.parse(state.lastSlotAt) + randomGapMs(pacing.minGapSeconds, pacing.maxGapSeconds, random));
  let day = dayKey(at, pacing.timeZone);
  let used = day === state.day ? state.used : 0;
  if (used >= pacing.dailyCap) {
    at = startOfNextDay(at, pacing.timeZone) + randomGapMs(pacing.minGapSeconds, pacing.maxGapSeconds, random);
    day = dayKey(at, pacing.timeZone);
    used = 0;
  }
  const slot = new Date(at);
  setMeta(db, META_KEY, JSON.stringify({ lastSlotAt: slot.toISOString(), day, used: used + 1 } satisfies ScheduleState));
  return slot;
}

/**
 * Bắt đầu lại lịch cấp lượt (lúc khởi động, sau khi đóng các file Zalo đã xóa): lượt đã cấp cho file
 * vừa đóng được trả lại, hàng chờ còn lại sẽ được cấp lượt mới theo thứ tự nơi gọi chọn. Trần ngày
 * vẫn giữ: hôm nay tính `callsToday(mốc 00:00 hôm nay)` lệnh đã thật sự gửi Zalo.
 */
export function restartRenewSchedule(db: DatabaseSync, pacing: RenewPacing, now: Date, callsToday: (sinceIso: string) => number): void {
  const startOfToday = DateTime.fromJSDate(now, { zone: pacing.timeZone }).startOf("day").toUTC().toISO() ?? now.toISOString();
  const state: ScheduleState = { lastSlotAt: null, day: dayKey(now.getTime(), pacing.timeZone), used: callsToday(startOfToday) };
  setMeta(db, META_KEY, JSON.stringify(state));
}
