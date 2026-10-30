/**
 * Định dạng mốc giờ theo múi giờ của KHO (`timeZone` từ `/api/auth/me`), không
 * theo giờ trình duyệt: "tin lúc 7h sáng" phải là 7h của kho, kể cả khi người
 * xem đang mở dashboard từ máy đặt múi giờ khác. Server trả mọi mốc ở ISO UTC.
 *
 * Chuỗi hiển thị tự ghép từ formatToParts ("28/10 14:30") chứ không dùng
 * format() của locale vi-VN: bản đó đặt giờ TRƯỚC ngày và nối ngày-tháng bằng
 * gạch, khác hẳn cách đọc quen. Formatter tạo một lần cho mỗi zone rồi dùng lại -
 * vài trăm bong bóng tin mà mỗi cái dựng một Intl.DateTimeFormat là phí thấy rõ.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, kind: "parts" | "weekday"): Intl.DateTimeFormat {
  const key = `${timeZone}|${kind}`;
  let f = cache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === "parts"
        ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
        : { weekday: "long" };
    const locale = kind === "parts" ? "en-US" : "vi-VN";
    // Múi giờ server trả sai tên thì Intl ném RangeError - rơi về UTC thay vì trắng trang
    try {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone });
    } catch {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
    }
    cache.set(key, f);
  }
  return f;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ZonedParts = { year: string; month: string; day: string; hour: string; minute: string };

/** Tách ngày/giờ theo zone bằng formatToParts (đúng cả zone có DST) */
function zonedParts(d: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone, "parts").formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Vài engine trả "24" cho nửa đêm ở chế độ 24h - kẹp về "00"
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/** "14:30" */
export function formatClock(iso: string | null | undefined, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "-";
  const p = zonedParts(d, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "28/10 14:30" trong năm nay, "28/10/2025 14:30" nếu khác năm - kho có tin nhiều năm trước */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "-";
  const p = zonedParts(d, timeZone);
  const year = p.year === zonedParts(new Date(), timeZone).year ? "" : `/${p.year}`;
  return `${p.day}/${p.month}${year} ${p.hour}:${p.minute}`;
}

/** "Thứ Tư, 11/03/2026" - dải phân cách ngày trong khung tin nhắn */
export function formatDayHeading(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "-";
  const p = zonedParts(d, timeZone);
  const weekday = formatter(timeZone, "weekday").format(d);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${p.day}/${p.month}/${p.year}`;
}

/** Khóa ngày "YYYY-MM-DD" theo zone - để nhóm tin theo ngày */
export function dayKey(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "";
  const p = zonedParts(d, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Ngày + giờ hiện tại theo zone, cộng thêm `addMinutes` - điền sẵn ô hẹn giờ */
export function nowInZone(timeZone: string, addMinutes = 0): { date: string; time: string } {
  const p = zonedParts(new Date(Date.now() + addMinutes * 60_000), timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "3 phút", "2 giờ 5 phút" - độ dài khoảng mất kết nối */
export function formatDuration(fromIso: string, toIso: string | null): string {
  const from = parse(fromIso);
  const to = toIso ? parse(toIso) : new Date();
  if (!from || !to) return "-";
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return "dưới 1 phút";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} giờ ${minutes % 60} phút`;
  return `${Math.floor(hours / 24)} ngày`;
}

/** "24/07/2024" - ngày gửi file trong kết quả tìm, như Zalo */
export function formatDayMonthYear(iso: string | null | undefined, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "-";
  const p = zonedParts(d, timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}
