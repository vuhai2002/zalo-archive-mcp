import type { ReactNode } from "react";
import { foldForSearch } from "./fold-for-search";

/**
 * Tô các đoạn khớp từ khóa trong một đoạn văn - KHÔNG phân biệt dấu/hoa thường
 * (gõ "chuc mung" phải tô được "Chúc mừng", giống cách server tìm).
 *
 * Gấp TỪNG ký tự một thay vì gấp cả chuỗi: gấp cả chuỗi làm lệch vị trí (NFD
 * tách "ú" thành 2 ký tự) nên không map ngược về chuỗi gốc được. Ký tự nào gấp
 * ra không đúng 1 ký tự thì giữ nguyên bản thường của nó cho vị trí khỏi lệch.
 *
 * Trả về mảng React node (chuỗi + <mark>) - không bao giờ dựng HTML từ chuỗi.
 */
function foldPerChar(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    const folded = foldForSearch(ch);
    out += folded.length === 1 ? folded : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch;
  }
  return out;
}

export function highlightMatches(text: string, query: string): ReactNode[] {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
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
          <mark key={start} className="rounded bg-amber-200 px-0.5 text-ink dark:bg-amber-700/60">
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
