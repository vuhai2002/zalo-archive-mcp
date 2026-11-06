import type { TextStyleSpan } from "../../archive-api-types";

/**
 * Cắt chữ một tin thành các đoạn để hiện như Zalo: mỗi đoạn mang định dạng (đậm,
 * nghiêng, màu, cỡ chữ - từ `textStyles`) và có thể là link http(s).
 *
 * Thuần, không React: test thẳng được. Link chỉ nhận http/https - không bao giờ ra
 * `javascript:` hay scheme lạ dù chữ do người khác gửi.
 */
export type SegmentStyle = Omit<TextStyleSpan, "start" | "end">;
export type RichSegment = { text: string; style: SegmentStyle; href: string | null };

const PLAIN: SegmentStyle = { bold: false, italic: false, underline: false, strike: false, color: null, size: null };
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Link trong câu hay dính dấu câu ở cuối ("xem https://a.vn/b." ): bỏ dấu đó, và ")" lẻ không có "(" */
function trimUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?'"]+$/, "");
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
  return url;
}

export function findLinks(text: string): Array<{ start: number; end: number; href: string }> {
  const links: Array<{ start: number; end: number; href: string }> = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") links.push({ start: m.index, end: m.index + url.length, href: u.toString() });
    } catch {
      /* không phải URL hợp lệ: để nguyên là chữ */
    }
  }
  return links;
}

export function buildRichSegments(text: string, spans: TextStyleSpan[]): RichSegment[] {
  const links = findLinks(text);
  const cuts = new Set<number>([0, text.length]);
  for (const s of spans) cuts.add(Math.max(0, Math.min(s.start, text.length))).add(Math.max(0, Math.min(s.end, text.length)));
  for (const l of links) cuts.add(l.start).add(l.end);
  const points = [...cuts].sort((a, b) => a - b);

  const segments: RichSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a >= b) continue;
    const style = { ...PLAIN };
    for (const s of spans) {
      if (s.start > a || s.end < b) continue;
      style.bold ||= s.bold;
      style.italic ||= s.italic;
      style.underline ||= s.underline;
      style.strike ||= s.strike;
      if (s.color && HEX_COLOR.test(s.color)) style.color = s.color;
      if (s.size) style.size = s.size;
      if (s.mention) style.mention = true;
    }
    const href = links.find((l) => l.start <= a && l.end >= b)?.href ?? null;
    const last = segments[segments.length - 1];
    // Gộp đoạn kề nhau giống hệt định dạng để DOM gọn
    if (last && last.href === href && JSON.stringify(last.style) === JSON.stringify(style)) last.text += text.slice(a, b);
    else segments.push({ text: text.slice(a, b), style, href });
  }
  return segments;
}
