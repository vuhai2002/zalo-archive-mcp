import type { ReactNode } from "react";
import { matchRanges } from "./search-snippet";

/**
 * Tô các đoạn khớp từ khóa trong một đoạn văn - KHÔNG phân biệt dấu/hoa thường (gõ "chuc mung" phải tô được "Chúc mừng"),
 * từ có dấu nối khớp mọi kiểu dấu ở giữa ("admin@example.com" tô cả "admin.example.com"), giống cách server tìm.
 * Chữ khớp đậm và xanh như Zalo PC.
 *
 * Trả về mảng React node (chuỗi + <mark>) - không bao giờ dựng HTML từ chuỗi.
 */
export function highlightMatches(text: string, query: string): ReactNode[] {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return [text];

  // Đánh dấu từng vị trí thuộc một đoạn khớp, rồi gom các vị trí liền nhau
  const marked = new Uint8Array(text.length);
  for (const [from, to] of ranges) marked.fill(1, from, to);

  const out: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      const piece = text.slice(start, i);
      out.push(
        marked[start] ? (
          <mark key={start} className="bg-transparent font-semibold text-zalo-500">
            {piece}
          </mark>
        ) : (
          piece
        ),
      );
      start = i;
    }
  }
  return out;
}
