/**
 * Định dạng chữ của tin gửi đi (thanh Định dạng tin nhắn trên dashboard), đúng kiểu Zalo gửi trong `textProperties`:
 * mỗi mục `{ start, len, st }`, vị trí theo đơn vị UTF-16 của chữ, `st` là các mã cách bằng dấu phẩy.
 *
 * Mã nhận (đúng bộ trên thanh định dạng của Zalo): `b` đậm, `i` nghiêng, `u` gạch chân, `s` gạch ngang; 4 màu của Zalo;
 * cỡ `f_13` Nhỏ, `f_18` Lớn, `f_20` Rất lớn (Trung bình = không mã); `lst_1` gạch đầu dòng, `lst_2` đánh số (mỗi dòng
 * một mục phủ trọn dòng); `ind_10`..`ind_50` thụt lề 1-5 bậc. Mã lạ, vị trí ngoài chữ thì từ chối cả yêu cầu: định dạng
 * do giao diện của kho dựng, sai là lỗi cần thấy chứ không lặng lẽ bỏ.
 */
export type OutboxTextStyle = { start: number; len: number; st: string };

export const ZALO_TEXT_COLORS = ["db342e", "f27806", "f7b503", "15a85f"] as const;
const CODES = new Set<string>([
  "b",
  "i",
  "u",
  "s",
  ...ZALO_TEXT_COLORS.map((c) => `c_${c}`),
  "f_13",
  "f_18",
  "f_20",
  "lst_1",
  "lst_2",
  ...[1, 2, 3, 4, 5].map((n) => `ind_${n}0`),
]);
const MAX_STYLES = 1000;

/**
 * Kiểm định dạng theo chữ GỐC (chưa cắt khoảng trắng) rồi dời về chữ đã cắt hai đầu - chữ lưu vào hàng đợi là chữ đã cắt.
 * Phần nằm trong khoảng trắng bị cắt thì bỏ; mục còn rỗng thì bỏ.
 */
export function checkOutboxStyles(raw: unknown, rawText: string): { styles: OutboxTextStyle[] } | { error: string } {
  if (raw === undefined || raw === null) return { styles: [] };
  if (!Array.isArray(raw)) return { error: "styles phải là danh sách" };
  if (raw.length > MAX_STYLES) return { error: `Tối đa ${MAX_STYLES} đoạn định dạng mỗi tin.` };
  const lead = rawText.length - rawText.trimStart().length;
  const finalLength = rawText.trim().length;
  const out: OutboxTextStyle[] = [];
  for (const item of raw) {
    const s = item as { start?: unknown; len?: unknown; st?: unknown } | null;
    const start = s?.start;
    const len = s?.len;
    if (!Number.isInteger(start) || !Number.isInteger(len) || (start as number) < 0 || (len as number) <= 0 || typeof s?.st !== "string") {
      return { error: "Định dạng chữ không hợp lệ (start / len / st)." };
    }
    if ((start as number) + (len as number) > rawText.length) return { error: "Định dạng chữ nằm ngoài nội dung tin." };
    const codes = s.st.split(",");
    if (codes.some((c) => !CODES.has(c)) || new Set(codes).size !== codes.length) return { error: `Mã định dạng lạ: ${s.st.slice(0, 40)}` };
    const from = Math.max(0, (start as number) - lead);
    const to = Math.min(finalLength, (start as number) + (len as number) - lead);
    if (to > from) out.push({ start: from, len: to - from, st: s.st });
  }
  return { styles: out };
}
