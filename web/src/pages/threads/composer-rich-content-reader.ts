import { colorToHex, isZaloColor, SIZE_CODE, SIZE_PX, sizeFromFontAttr, type ZaloSize, type ZaloStyle } from "./composer-zalo-format";

/**
 * Đọc nội dung có định dạng (ô soạn tin, hoặc HTML khi dán) thành chữ + mã định dạng Zalo. Chỉ nhận ĐÚNG bộ định dạng của Zalo:
 * đậm / nghiêng / gạch chân / gạch ngang, 4 màu, 3 cỡ chữ, danh sách gạch đầu dòng / đánh số, thụt lề 1-5 bậc. Mọi thứ khác
 * (ảnh, bảng, màu lạ, cỡ lạ, link...) chỉ còn là chữ. Thuần, làm việc trên "giống DOM" (`NodeLike`) để test không cần trình duyệt.
 *
 * Dòng: thẻ khối (div, p, li, blockquote...) và `<br>` ngắt dòng như trình duyệt vẽ; `<br>` cuối một khối không thành dòng
 * trống. Danh sách lồng nhau / blockquote (lệnh Thụt lề của trình duyệt) / `data-zl-indent` (bong bóng của kho) thành bậc thụt.
 */
export type NodeLike = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<NodeLike>;
  getAttribute?: (name: string) => string | null;
  style?: { fontWeight?: string; fontStyle?: string; textDecoration?: string; textDecorationLine?: string; color?: string; fontSize?: string };
};
export type RichValue = { text: string; styles: ZaloStyle[] };
/** `collapseWhitespace`: HTML dán từ nơi khác (khoảng trắng / xuống dòng trong mã HTML không phải chữ); ô soạn thì giữ nguyên */
export type ReadOptions = { collapseWhitespace: boolean };

type Inline = { b: boolean; i: boolean; u: boolean; s: boolean; color: string | null; size: ZaloSize | null };
type Ctx = { inline: Inline; listType: "bullet" | "number" | null; inLi: boolean; listDepth: number; quoteDepth: number; attrIndent: number; pre: boolean };
type Line = { runs: Array<{ text: string; inline: Inline }>; list: "bullet" | "number" | null; indent: number };

const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "TITLE", "META", "LINK", "TEMPLATE", "NOSCRIPT", "IMG", "SVG", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
const BLOCK = new Set(["DIV", "P", "LI", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "TABLE", "TBODY", "THEAD", "SECTION", "ARTICLE", "HEADER", "FOOTER", "PRE", "DL", "DT", "DD", "FIGURE", "ADDRESS", "HR"]);
const MAX_INDENT = 5;
const PLAIN: Inline = { b: false, i: false, u: false, s: false, color: null, size: null };

const paletteOrNull = (value: string) => {
  const hex = colorToHex(value);
  return isZaloColor(hex) ? hex : null;
};
function sizeFromPx(value: string): ZaloSize | null {
  const px = /^([\d.]+)px$/.exec(value.trim())?.[1];
  if (!px) return null;
  return (Object.keys(SIZE_PX) as ZaloSize[]).find((k) => Math.abs(SIZE_PX[k] - Number(px)) < 0.6) ?? null;
}

function inlineOf(el: NodeLike, parent: Inline): Inline {
  const n = el.nodeName.toUpperCase();
  const next = { ...parent };
  if (n === "B" || n === "STRONG" || /^H[1-6]$/.test(n)) next.b = true;
  if (n === "I" || n === "EM") next.i = true;
  if (n === "U" || n === "INS") next.u = true;
  if (n === "S" || n === "STRIKE" || n === "DEL") next.s = true;
  if (n === "FONT") {
    const color = el.getAttribute?.("color");
    if (color) next.color = paletteOrNull(color);
    const size = el.getAttribute?.("size");
    if (size) next.size = sizeFromFontAttr(size);
  }
  const st = el.style;
  if (st) {
    const w = st.fontWeight;
    if (w) {
      const num = w === "bold" || w === "bolder" ? 700 : w === "normal" || w === "lighter" ? 400 : Number(w);
      if (Number.isFinite(num)) next.b = num >= 500;
    }
    if (st.fontStyle) next.i = /italic|oblique/.test(st.fontStyle);
    // Gạch chân / gạch ngang của thẻ cha vẫn hiện trên thẻ con dù thẻ con ghi "none": chỉ bật, không tắt
    const deco = `${st.textDecorationLine ?? ""} ${st.textDecoration ?? ""}`;
    if (deco.includes("underline")) next.u = true;
    if (deco.includes("line-through")) next.s = true;
    if (st.color) next.color = paletteOrNull(st.color);
    if (st.fontSize) next.size = sizeFromPx(st.fontSize);
  }
  return next;
}

function codesOf(x: Inline): string {
  return [x.b && "b", x.i && "i", x.u && "u", x.s && "s", x.color && `c_${x.color}`, x.size && SIZE_CODE[x.size]].filter(Boolean).join(",");
}

export function readRichContent(root: NodeLike, opts: ReadOptions): RichValue {
  const lines: Line[] = [{ runs: [], list: null, indent: 0 }];
  const cur = () => lines[lines.length - 1]!;
  const hasContent = (l: Line) => l.runs.some((r) => r.text.length > 0);
  const newLine = () => void lines.push({ runs: [], list: null, indent: 0 });
  const boundary = () => {
    if (hasContent(cur())) newLine();
  };
  const append = (text: string, ctx: Ctx) => {
    const line = cur();
    if (!hasContent(line)) {
      if (opts.collapseWhitespace && !ctx.pre) text = text.replace(/^ +/, "");
      if (!text) return;
      line.list = ctx.inLi ? ctx.listType : null;
      line.indent = Math.min(MAX_INDENT, Math.max(0, ctx.listDepth - 1) + ctx.quoteDepth + ctx.attrIndent);
    }
    line.runs.push({ text, inline: ctx.inline });
  };

  const walk = (node: NodeLike, ctx: Ctx) => {
    if (node.nodeType === 3) {
      let t = (node.nodeValue ?? "").replace(/[​﻿]/g, "").replace(/ /g, " ").replace(/\r\n?/g, "\n");
      if (opts.collapseWhitespace && !ctx.pre) t = t.replace(/[\t\n\f ]+/g, " ");
      t.split("\n").forEach((part, i) => {
        if (i > 0) newLine();
        if (part) append(part, ctx);
      });
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (SKIP.has(name) || node.getAttribute?.("aria-hidden") === "true") return;
    if (name === "BR") return newLine();
    const block = BLOCK.has(name);
    const next: Ctx = { ...ctx, inline: inlineOf(node, ctx.inline) };
    if (name === "UL" || name === "OL") Object.assign(next, { listType: name === "UL" ? "bullet" : "number", listDepth: ctx.listDepth + 1, inLi: false });
    if (name === "LI") next.inLi = true;
    if (name === "BLOCKQUOTE") next.quoteDepth = ctx.quoteDepth + 1;
    if (name === "PRE") next.pre = true;
    const zlList = node.getAttribute?.("data-zl-list");
    if (zlList === "bullet" || zlList === "number") Object.assign(next, { listType: zlList, inLi: true });
    const zlIndent = Number(node.getAttribute?.("data-zl-indent"));
    if (Number.isInteger(zlIndent) && zlIndent > 0) next.attrIndent = ctx.attrIndent + zlIndent;
    if (block) boundary();
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]!, next);
    if (block) boundary();
    else if (name === "TD" || name === "TH") append(" ", next);
  };
  walk(root, { inline: PLAIN, listType: null, inLi: false, listDepth: 0, quoteDepth: 0, attrIndent: 0, pre: false });

  // Ghép chữ + mã: định dạng chữ gộp các đoạn liền nhau cùng mã; danh sách / thụt lề mỗi dòng một mục phủ trọn dòng
  let text = "";
  const inline: ZaloStyle[] = [];
  const block: ZaloStyle[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) text += "\n";
    if (opts.collapseWhitespace) {
      const last = line.runs[line.runs.length - 1];
      if (last) last.text = last.text.replace(/ +$/, "");
    }
    const lineStart = text.length;
    for (const run of line.runs) {
      const st = codesOf(run.inline);
      const start = text.length;
      text += run.text;
      if (!st || !run.text) continue;
      const prev = inline[inline.length - 1];
      if (prev && prev.st === st && prev.start + prev.len === start) prev.len += run.text.length;
      else inline.push({ start, len: run.text.length, st });
    }
    const len = text.length - lineStart;
    if (len > 0 && line.list) block.push({ start: lineStart, len, st: line.list === "bullet" ? "lst_1" : "lst_2" });
    if (len > 0 && line.indent > 0) block.push({ start: lineStart, len, st: `ind_${line.indent}0` });
  });

  // Cắt khoảng trắng hai đầu (như chữ lưu vào hàng đợi) và dời định dạng theo
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const styles = [...inline, ...block]
    .map((s) => {
      const from = Math.max(0, s.start - lead);
      const to = Math.min(trimmed.length, s.start + s.len - lead);
      return { start: from, len: to - from, st: s.st };
    })
    .filter((s) => s.len > 0);
  return { text: trimmed, styles };
}
