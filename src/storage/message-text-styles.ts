/**
 * Định dạng chữ của tin Zalo ("rtf": đậm, nghiêng, màu, cỡ chữ...). Zalo gửi trong
 * `content.params` một chuỗi JSON dạng
 * `{"styles":[{"start":0,"len":47,"st":"f_18,b,c_db342e"}, ...]}`; vị trí tính theo
 * đơn vị UTF-16 của chữ (giống String của JavaScript), trên đúng `content.title`.
 *
 * Mã kiểu đã thấy: `b` đậm, `i` nghiêng, `u` gạch chân, `s` gạch ngang, `c_<hex6>` màu chữ,
 * `f_13` chữ nhỏ, `f_18` chữ to. `lst_*` (danh sách), `ind_*` (thụt lề) bỏ qua - hiện như chữ thường.
 *
 * Dữ liệu này do người khác gửi tới: chỉ nhận đúng các mã trên, màu phải đúng 6 số hex,
 * vị trí phải nằm trong chữ. Mã lạ bị bỏ, không bao giờ thành CSS tùy ý.
 */
export type TextStyleSpan = {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** "#rrggbb" hoặc null */
  color: string | null;
  size: "small" | "big" | null;
};

const MAX_SPANS = 500;

export function parseTextStyles(paramsJson: string | null | undefined, textLength: number): TextStyleSpan[] {
  if (!paramsJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(paramsJson);
  } catch {
    return [];
  }
  const styles = (parsed as { styles?: unknown } | null)?.styles;
  if (!Array.isArray(styles)) return [];

  const spans: TextStyleSpan[] = [];
  for (const raw of styles.slice(0, MAX_SPANS)) {
    const s = raw as { start?: unknown; len?: unknown; st?: unknown } | null;
    const start = Number(s?.start);
    const len = Number(s?.len);
    if (!Number.isInteger(start) || !Number.isInteger(len) || start < 0 || len <= 0 || typeof s?.st !== "string") continue;
    const end = Math.min(start + len, textLength);
    if (start >= end) continue;
    const span: TextStyleSpan = { start, end, bold: false, italic: false, underline: false, strike: false, color: null, size: null };
    for (const code of s.st.split(",").map((c) => c.trim().toLowerCase())) {
      if (code === "b") span.bold = true;
      else if (code === "i") span.italic = true;
      else if (code === "u") span.underline = true;
      else if (code === "s") span.strike = true;
      else if (/^c_[0-9a-f]{6}$/.test(code)) span.color = `#${code.slice(2)}`;
      else if (code === "f_13") span.size = "small";
      else if (code === "f_18") span.size = "big";
    }
    if (span.bold || span.italic || span.underline || span.strike || span.color || span.size) spans.push(span);
  }
  return spans;
}
