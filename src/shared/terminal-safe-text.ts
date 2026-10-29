/**
 * Ký tự điều khiển có thể làm màn hình duyệt hiển thị KHÁC thứ thật sự được gửi:
 * `\r` ghi đè dòng, chuỗi ESC/ANSI (vd ẩn chữ), ký tự đảo chiều BiDi. Một nháp do
 * model bị prompt injection soạn có thể giấu nội dung thật sau chúng để lừa
 * người duyệt. Giữ `\t` và `\n` (chữ bình thường). Module thuần.
 */
// Dựng từ mã số cho dễ đọc: C0 trừ tab/xuống dòng, DEL + C1, dấu LRM/RLM, khối BiDi
const UNSAFE_RANGES: Array<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const UNSAFE_PATTERN = new RegExp(
  `[${UNSAFE_RANGES.map(([a, b]) => `\\u${hex(a)}-\\u${hex(b)}`).join("")}]`,
  "gu",
);

function hex(n: number): string {
  return n.toString(16).padStart(4, "0");
}

export function containsUnsafeControlChars(text: string): boolean {
  UNSAFE_PATTERN.lastIndex = 0;
  return UNSAFE_PATTERN.test(text);
}

/** Hiện chuỗi trên terminal trên ĐÚNG một dòng, ký tự điều khiển hiện thành mã `\uXXXX` */
export function escapeForTerminal(text: string): string {
  return text
    .replace(UNSAFE_PATTERN, (c) => `\\u${hex(c.codePointAt(0)!)}`)
    .replace(/\t/g, "\\t")
    .replace(/\n/g, " \\n ");
}
