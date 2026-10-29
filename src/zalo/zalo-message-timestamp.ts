/**
 * Đổi `data.ts` của zca-js (chuỗi/số, đơn vị không ghi ở đâu) thành ISO UTC.
 *
 * Phân biệt giây / mili theo ĐỘ LỚN như zalo-agent: >= 1e11 là mili, >= 1e9 là
 * giây, nhỏ hơn là rác. KHÁC zalo-agent: không kẹp tin quá cũ, vì kho nhận cả
 * tin xin lại sau rớt mạng và lịch sử đồng bộ từ điện thoại - giữ đúng giờ gửi
 * thật của tin cũ là việc chính. Chỉ chặn mốc ở TƯƠNG LAI (quá 5 phút lệch đồng
 * hồ) và mốc trước năm 2010.
 *
 * Module thuần.
 */
const MILLIS_THRESHOLD = 1e11;
const SECONDS_THRESHOLD = 1e9;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_VALID_MS = Date.UTC(2010, 0, 1);

export function zaloTimestampToIso(raw: unknown, receivedAt: Date): string {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return receivedAt.toISOString();
  const ms = n >= MILLIS_THRESHOLD ? Math.floor(n) : n >= SECONDS_THRESHOLD ? Math.floor(n * 1000) : null;
  if (ms === null || ms < EARLIEST_VALID_MS || ms - receivedAt.getTime() > MAX_CLOCK_SKEW_MS) {
    return receivedAt.toISOString();
  }
  return new Date(ms).toISOString();
}
