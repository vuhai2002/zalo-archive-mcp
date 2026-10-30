import type { ReactNode } from "react";
import { foldPerChar, searchWords } from "./search-snippet";

/**
 * Tô các đoạn khớp từ khóa trong một đoạn văn - KHÔNG phân biệt dấu/hoa thường
 * (gõ "chuc mung" phải tô được "Chúc mừng", giống cách server tìm). Chữ khớp tô xanh như Zalo.
 *
 * Trả về mảng React node (chuỗi + <mark>) - không bao giờ dựng HTML từ chuỗi.
 */
export function highlightMatches(text: string, query: string): ReactNode[] {
  const words = searchWords(query);
  if (words.length === 0) return [text];
  const hay = foldPerChar(text);

  // Đánh dấu từng vị trí thuộc một đoạn khớp, rồi gom các vị trí liền nhau
  const marked = new Uint8Array(text.length);
  for (const w of words) {
    let from = 0;
    for (let at = hay.indexOf(w, from); at !== -1; at = hay.indexOf(w, from)) {
      marked.fill(1, at, at + w.length);
      from = at + w.length;
    }
  }

  const out: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      const piece = text.slice(start, i);
      out.push(
        marked[start] ? (
          <mark key={start} className="bg-transparent text-zalo-500">
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
