/**
 * Đưa chữ tiếng Việt về dạng phẳng để tìm kiếm: bỏ dấu, chữ thường.
 * "Hẹn ĐI ăn" và "hen di an" phải ra cùng một chuỗi.
 *
 * `đ`/`Đ` phải thay TƯỜNG MINH: U+0111 là một chữ cái riêng chứ không phải chữ
 * nền cộng dấu tổ hợp, nên `normalize("NFD")` không tách được (cũng vì vậy mà
 * `remove_diacritics` của FTS5 không xử lý nó).
 *
 * Module thuần.
 */

// Khối dấu phụ tổ hợp U+0300-U+036F, dựng bằng mã số cho dễ đọc trong editor
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

export function foldVietnameseForSearch(text: string): string {
  return text.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/**
 * Biến câu tìm của người dùng/model thành biểu thức FTS5 an toàn: mỗi từ là một
 * chuỗi trong ngoặc kép (AND ngầm), nên ký tự đặc biệt của cú pháp FTS5
 * (`*`, `:`, `NEAR`, `-`...) không bao giờ được hiểu là toán tử.
 *
 * Trả `null` khi không còn từ nào để tìm.
 */
export function buildFtsMatchExpression(query: string): string | null {
  const words = foldVietnameseForSearch(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 16);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"`).join(" ");
}
