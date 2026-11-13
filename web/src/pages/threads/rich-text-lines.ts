import type { TextStyleSpan } from "../../archive-api-types";
import { buildRichSegments, type RichSegment } from "./rich-text-segments";

/**
 * Tin có danh sách / thụt lề (Zalo gửi `lst_1` gạch đầu dòng, `lst_2` đánh số, `ind_N0` thụt N bậc - mỗi mục phủ trọn một
 * dòng) vẽ như Zalo Web: mỗi dòng thường là một khối, danh sách là thẻ `ul` / `ol` thật (dấu chấm tròn / số thứ tự do trình
 * duyệt vẽ, không nằm trong chữ). Module thuần: chia dòng rồi dựng cây danh sách lồng nhau.
 */
export type RichLine = { segments: RichSegment[]; list: "bullet" | "number" | null; indent: number };

/** Một danh sách: các mục, mỗi mục có thể chứa danh sách con (bậc thụt sâu hơn). `line` null = mục trống chỉ để chứa danh sách con */
export type RichList = { type: "bullet" | "number"; items: Array<{ line: RichLine | null; sublists: RichList[] }> };
export type RichBlock = { kind: "line"; line: RichLine } | { kind: "list"; list: RichList };

const MAX_DEPTH = 6;

export const hasLineStyles = (spans: TextStyleSpan[]): boolean => spans.some((s) => s.list || s.indent);

export function buildRichLines(text: string, spans: TextStyleSpan[]): RichLine[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);

  // Cắt các đoạn có định dạng theo dấu xuống dòng
  const lineSegments: RichSegment[][] = starts.map(() => []);
  let line = 0;
  for (const seg of buildRichSegments(text, spans)) {
    seg.text.split("\n").forEach((part, i) => {
      if (i > 0) line++;
      if (part) lineSegments[line]?.push({ ...seg, text: part });
    });
  }

  return starts.map((start, i) => ({
    segments: lineSegments[i] ?? [],
    list: spans.find((s) => s.list && s.start === start)?.list ?? null,
    indent: Math.max(0, ...spans.filter((s) => s.indent && s.start === start).map((s) => s.indent!)),
  }));
}

/**
 * Gom dòng thành khối như Zalo: dòng thường đứng riêng; các dòng danh sách liền nhau thành một danh sách, dòng thụt sâu hơn
 * thành danh sách con của mục ngay trên. Đổi kiểu (gạch đầu dòng sang đánh số) ở cùng bậc = mở danh sách mới.
 */
export function buildRichBlocks(lines: RichLine[]): RichBlock[] {
  const blocks: RichBlock[] = [];
  let open: RichList[] = [];
  for (const line of lines) {
    if (!line.list) {
      open = [];
      blocks.push({ kind: "line", line });
      continue;
    }
    const depth = Math.min(MAX_DEPTH, line.indent + 1);
    open = open.slice(0, depth);
    if (open.length === depth && open[depth - 1]!.type !== line.list) open = open.slice(0, depth - 1);
    while (open.length < depth) {
      const list: RichList = { type: line.list, items: [] };
      const parent = open[open.length - 1];
      if (!parent) blocks.push({ kind: "list", list });
      else {
        // Danh sách mở thẳng ở bậc sâu (chưa có mục cha): thêm một mục trống làm chỗ chứa
        if (parent.items.length === 0) parent.items.push({ line: null, sublists: [] });
        parent.items[parent.items.length - 1]!.sublists.push(list);
      }
      open.push(list);
    }
    open[depth - 1]!.items.push({ line, sublists: [] });
  }
  return blocks;
}
