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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Mẫu khớp của từng từ trong từ khóa, giống cách server tìm: từ có dấu nối ("admin@example.com") khớp các mẩu chữ / số
 * LIỀN nhau đúng thứ tự, dấu ở giữa là gì cũng được ("admin.example.com" cũng khớp, như Zalo PC).
 */
function wordPatterns(query: string): RegExp[] {
  return searchWords(query).flatMap((w) => {
    const tokens = w.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return tokens.length > 0 ? [new RegExp(tokens.map(escapeRegExp).join("[^\\p{L}\\p{N}]+"), "gu")] : [];
  });
}

/** Các đoạn [đầu, cuối) của `text` khớp từ khóa (không dấu, không hoa thường), theo thứ tự từng từ */
export function matchRanges(text: string, query: string): Array<[number, number]> {
  const hay = foldPerChar(text);
  const out: Array<[number, number]> = [];
  for (const re of wordPatterns(query)) {
    for (const m of hay.matchAll(re)) if (m[0].length > 0) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** Vị trí đầu tiên trong `text` khớp một từ của từ khóa (không dấu, không hoa thường); -1 nếu không có */
export function firstMatchIndex(text: string, query: string): number {
  const starts = matchRanges(text, query).map(([at]) => at);
  return starts.length > 0 ? Math.min(...starts) : -1;
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
