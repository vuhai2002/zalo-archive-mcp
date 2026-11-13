import type { TextStyleSpan } from "../../archive-api-types";

/**
 * Bộ định dạng đúng như thanh "Định dạng tin nhắn" của Zalo (đo trên Zalo Web): 4 màu + màu mặc định, 4 cỡ chữ (Nhỏ 13px,
 * Trung bình 15px = không mã, Lớn 18px, Rất lớn 20px). Mã gửi đi là mã Zalo dùng trong `textProperties`. Module thuần.
 */
export type ZaloStyle = { start: number; len: number; st: string };
export type ZaloSize = "small" | "big" | "xbig";

export const ZALO_COLORS = [
  { hex: "db342e", label: "Đỏ" },
  { hex: "f27806", label: "Cam" },
  { hex: "f7b503", label: "Vàng" },
  { hex: "15a85f", label: "Xanh lá" },
] as const;
const PALETTE = new Set<string>(ZALO_COLORS.map((c) => c.hex));
export const isZaloColor = (hex: string | null | undefined): hex is string => !!hex && PALETTE.has(hex);

/** Thứ tự như menu Cỡ chữ của Zalo; `null` = Trung bình */
export const ZALO_SIZES: ReadonlyArray<{ size: ZaloSize | null; label: string }> = [
  { size: "xbig", label: "Rất lớn" },
  { size: "big", label: "Lớn" },
  { size: null, label: "Trung bình" },
  { size: "small", label: "Nhỏ" },
];
export const SIZE_CODE: Record<ZaloSize, string> = { small: "f_13", big: "f_18", xbig: "f_20" };
export const SIZE_PX: Record<ZaloSize, number> = { small: 13, big: 18, xbig: 20 };

/**
 * Giá trị `fontSize` của execCommand mà ô soạn dùng cho từng cỡ (trình duyệt bọc chữ trong `<font size="N">`, CSS của ô soạn
 * đổi N sang đúng px của Zalo). "3" = Trung bình: ô soạn gỡ bỏ thẻ đó ngay sau lệnh.
 */
export const EDITOR_FONT_SIZE: Record<ZaloSize | "normal", string> = { small: "2", normal: "3", big: "5", xbig: "6" };
export function sizeFromFontAttr(n: string | null): ZaloSize | null {
  return n === "1" || n === "2" ? "small" : n === "5" ? "big" : n === "6" || n === "7" ? "xbig" : null;
}

/** "#abc", "#aabbcc", "rgb(1, 2, 3)" -> "aabbcc" (chữ thường); không đọc được thì null */
export function colorToHex(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return m[1]!;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return null;
  return [rgb[1], rgb[2], rgb[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("");
}

/** Mã Zalo -> đoạn hiển thị (bong bóng tạm vừa gửi hiện đúng định dạng như tin thật sẽ hiện) */
export function zaloStylesToSpans(styles: ZaloStyle[], textLength: number): TextStyleSpan[] {
  const spans: TextStyleSpan[] = [];
  for (const s of styles) {
    const end = Math.min(s.start + s.len, textLength);
    if (s.start >= end) continue;
    const span: TextStyleSpan = { start: s.start, end, bold: false, italic: false, underline: false, strike: false, color: null, size: null };
    for (const code of s.st.split(",")) {
      if (code === "b") span.bold = true;
      else if (code === "i") span.italic = true;
      else if (code === "u") span.underline = true;
      else if (code === "s") span.strike = true;
      else if (code.startsWith("c_") && isZaloColor(code.slice(2))) span.color = `#${code.slice(2)}`;
      else if (code === "f_13") span.size = "small";
      else if (code === "f_18") span.size = "big";
      else if (code === "f_20") span.size = "xbig";
      else if (code === "lst_1") span.list = "bullet";
      else if (code === "lst_2") span.list = "number";
      else if (/^ind_[1-5]0$/.test(code)) span.indent = Number(code.slice(4, -1));
    }
    spans.push(span);
  }
  return spans;
}
