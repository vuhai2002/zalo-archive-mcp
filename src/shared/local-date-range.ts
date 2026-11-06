import { DateTime } from "luxon";

/**
 * Quy ngày/giờ TƯỜNG (theo múi giờ kho) sang UTC. Model đưa ngày và giờ RỜI
 * nhau, không bao giờ một chuỗi datetime: `new Date("...")` hiểu theo giờ máy,
 * đổi máy là lệch cả ngày (bài học scheduler của zalo-agent). Module thuần.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** "YYYY-MM-DD" -> mốc 00:00 ngày đó (UTC ISO); null nếu sai */
export function startOfLocalDayUtc(date: string, timeZone: string): string | null {
  if (!DATE_PATTERN.test(date)) return null;
  const dt = DateTime.fromISO(date, { zone: timeZone }).startOf("day");
  return dt.isValid ? dt.toUTC().toJSDate().toISOString() : null;
}

/** "YYYY-MM-DD" -> mốc 00:00 ngày HÔM SAU, để lọc "tới hết ngày" dạng [from, to) */
export function startOfNextLocalDayUtc(date: string, timeZone: string): string | null {
  if (!DATE_PATTERN.test(date)) return null;
  const dt = DateTime.fromISO(date, { zone: timeZone }).startOf("day").plus({ days: 1 });
  return dt.isValid ? dt.toUTC().toJSDate().toISOString() : null;
}

/** Mốc UTC ISO -> ngày "YYYY-MM-DD" theo múi giờ kho (vd điền sẵn ô ngày trên dashboard) */
export function localDateOf(iso: string, timeZone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(timeZone).toISODate() ?? iso.slice(0, 10);
}

/** Ngày "YYYY-MM-DD" + giờ "HH:mm" theo múi giờ kho -> UTC ISO; null nếu sai/không tồn tại */
export function localWallClockToUtc(date: string, time: string, timeZone: string): string | null {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timeZone });
  return dt.isValid ? dt.toUTC().toJSDate().toISOString() : null;
}

/** Mốc 00:00 hôm nay theo múi giờ kho (UTC ISO) - để đếm trần gửi theo ngày */
export function startOfTodayUtc(timeZone: string, now: Date): string {
  return DateTime.fromJSDate(now, { zone: timeZone }).startOf("day").toUTC().toJSDate().toISOString();
}

/** Giờ (0-23) hiện tại theo múi giờ kho */
export function localHour(timeZone: string, now: Date): number {
  return DateTime.fromJSDate(now, { zone: timeZone }).hour;
}

/** Mốc HH:00 gần nhất SAU `now` (hôm nay nếu chưa qua, không thì ngày mai) theo múi giờ kho */
export function nextLocalHourUtc(timeZone: string, hour: number, now: Date): string {
  const local = DateTime.fromJSDate(now, { zone: timeZone });
  let target = local.set({ hour, minute: 0, second: 0, millisecond: 0 });
  if (target <= local) target = target.plus({ days: 1 });
  return target.toUTC().toJSDate().toISOString();
}

/** Mốc HH:00 của NGÀY MAI theo múi giờ kho (UTC ISO) - để dời tin đã chạm trần ngày */
export function localHourTomorrowUtc(timeZone: string, hour: number, now: Date): string {
  return DateTime.fromJSDate(now, { zone: timeZone })
    .plus({ days: 1 })
    .set({ hour, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate()
    .toISOString();
}

/** Mốc 00:00 của ngày cách hôm nay `daysBack` ngày theo múi giờ kho (0 = hôm nay) - cửa sổ "N ngày gần nhất" */
export function startOfLocalDayDaysAgoUtc(timeZone: string, daysBack: number, now: Date): string {
  return DateTime.fromJSDate(now, { zone: timeZone }).startOf("day").minus({ days: daysBack }).toUTC().toJSDate().toISOString();
}
