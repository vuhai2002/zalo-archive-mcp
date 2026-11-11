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

/** Tối đa chừng này mẩu chữ / số trong một câu tìm */
const MAX_TOKENS = 16;

/**
 * Biến câu tìm của người dùng/model thành biểu thức FTS5 an toàn. Các từ cách nhau bằng dấu cách: mỗi từ phải có
 * (AND ngầm), không cần liền nhau. Trong MỘT từ, các mẩu nối bằng dấu (`@ . / - :`...) phải đứng LIỀN nhau đúng thứ tự
 * (cụm FTS5): "admin@example.com" chỉ ra tin có đúng địa chỉ đó (cả "admin.example.com" như Zalo PC), không
 * ra tin chỉ có "admin" ở một chỗ và "example.com" ở chỗ khác; tương tự link, số điện thoại "0900.000.111", ngày
 * "13/10". Mỗi cụm nằm trong ngoặc kép và chỉ gồm chữ / số, nên ký tự đặc biệt của cú pháp FTS5 (`*`, `:`, `NEAR`,
 * `-`...) không bao giờ được hiểu là toán tử.
 *
 * Trả `null` khi không còn từ nào để tìm.
 */
export function buildFtsMatchExpression(query: string): string | null {
  const phrases: string[] = [];
  let budget = MAX_TOKENS;
  for (const word of foldVietnameseForSearch(query).split(/\s+/)) {
    const tokens = word
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 0)
      .slice(0, budget);
    if (tokens.length === 0) continue;
    phrases.push(`"${tokens.join(" ")}"`);
    budget -= tokens.length;
    if (budget <= 0) break;
  }
  return phrases.length > 0 ? phrases.join(" ") : null;
}
