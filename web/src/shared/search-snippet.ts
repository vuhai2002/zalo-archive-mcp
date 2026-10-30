import { foldForSearch } from "./fold-for-search";

/**
 * Gấp TỪNG ký tự một (bỏ dấu, thường hóa) mà giữ đúng độ dài chuỗi: gấp cả chuỗi làm lệch vị trí
 * (NFD tách "ú" thành 2 ký tự) nên không map ngược về chuỗi gốc được. Ký tự nào gấp ra không đúng
 * 1 ký tự thì giữ nguyên bản thường của nó cho vị trí khỏi lệch. Module thuần.
 */
export function foldPerChar(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    const folded = foldForSearch(ch);
    out += folded.length === 1 ? folded : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch;
  }
  return out;
}

/** Các từ của từ khóa, đã gấp - từ khóa rỗng thì mảng rỗng */
export function searchWords(query: string): string[] {
  return foldForSearch(query).split(/\s+/).filter(Boolean);
}

/** Vị trí đầu tiên trong `text` khớp một từ của từ khóa (không dấu, không hoa thường); -1 nếu không có */
export function firstMatchIndex(text: string, query: string): number {
  const hay = foldPerChar(text);
  let best = -1;
  for (const w of searchWords(query)) {
    const at = hay.indexOf(w);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

/**
 * Đoạn trích quanh chỗ khớp như kết quả tìm của Zalo: gộp xuống dòng thành dấu cách, chỗ khớp nằm xa
 * đầu thì cắt bớt phía trước (tại ranh giới từ) và mở đầu bằng "...", để chữ khớp luôn lọt vào hai
 * dòng hiện được. `lead`: số ký tự giữ lại trước chỗ khớp.
 */
export function snippetAround(text: string, query: string, lead = 28): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = firstMatchIndex(flat, query);
  if (at <= lead) return flat;
  const space = flat.lastIndexOf(" ", at - lead);
  const start = space === -1 ? at - lead : space + 1;
  return `... ${flat.slice(start)}`;
}
