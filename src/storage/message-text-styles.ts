/**
 * Định dạng chữ của tin Zalo ("rtf": đậm, nghiêng, màu, cỡ chữ...). Zalo gửi trong
 * `content.params` một chuỗi JSON dạng
 * `{"styles":[{"start":0,"len":47,"st":"f_18,b,c_db342e"}, ...]}`; vị trí tính theo
 * đơn vị UTF-16 của chữ (giống String của JavaScript), trên đúng `content.title`.
 *
 * Mã kiểu đã thấy: `b` đậm, `i` nghiêng, `u` gạch chân, `s` gạch ngang, `c_<hex6>` màu chữ,
 * `f_13` Nhỏ, `f_18` Lớn, `f_20` Rất lớn (Trung bình 15px = không mã); `lst_1` gạch đầu dòng, `lst_2` đánh số (mỗi dòng
 * một mục phủ trọn dòng, chữ KHÔNG kèm dấu chấm tròn / số - Zalo tự vẽ); `ind_10`..`ind_50` thụt lề 1-5 bậc.
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
  size: "small" | "big" | "xbig" | null;
  /** Chỗ nhắc tên (@Tên): tô xanh như Zalo */
  mention?: boolean;
  /** Dòng bắt đầu ở `start` là một mục danh sách (gạch đầu dòng / đánh số) */
  list?: "bullet" | "number";
  /** Dòng bắt đầu ở `start` thụt lề mấy bậc (1-5) */
  indent?: number;
};

const MAX_INDENT = 5;

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
      else if (code === "f_20") span.size = "xbig";
      else if (code === "lst_1") span.list = "bullet";
      else if (code === "lst_2") span.list = "number";
      else if (/^ind_[1-9]0$/.test(code)) span.indent = Math.min(MAX_INDENT, Number(code.slice(4, -1)));
    }
    if (span.bold || span.italic || span.underline || span.strike || span.color || span.size || span.list || span.indent) spans.push(span);
  }
  return spans;
}
