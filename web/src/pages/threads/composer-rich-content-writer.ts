import type { RichValue } from "./composer-rich-content-reader";
import { EDITOR_FONT_SIZE, zaloStylesToSpans } from "./composer-zalo-format";

/**
 * Chữ + mã định dạng Zalo -> HTML để chèn vào ô soạn (dán khi đang bật Định dạng). HTML này do kho tự dựng từ chữ thuần
 * (đã thoát ký tự) và đúng vài thẻ ô soạn hiểu: b, i, u, s, font (màu / cỡ), ul / ol / li, blockquote (thụt lề), div, br -
 * không bao giờ chép HTML của nơi khác vào trang. Thuần.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function richValueToEditorHtml({ text, styles }: RichValue): string {
  const spans = zaloStylesToSpans(styles, text.length);
  const inlineSpans = spans.filter((s) => s.bold || s.italic || s.underline || s.strike || s.color || s.size);
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);

  const lineHtml = (from: number, to: number): string => {
    const cuts = new Set([from, to]);
    for (const s of inlineSpans) for (const p of [s.start, s.end]) if (p > from && p < to) cuts.add(p);
    const points = [...cuts].sort((a, b) => a - b);
    let html = "";
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k]!;
      const b = points[k + 1]!;
      const on = inlineSpans.filter((s) => s.start <= a && s.end >= b);
      let piece = esc(text.slice(a, b));
      if (on.some((s) => s.strike)) piece = `<s>${piece}</s>`;
      if (on.some((s) => s.underline)) piece = `<u>${piece}</u>`;
      if (on.some((s) => s.italic)) piece = `<i>${piece}</i>`;
      if (on.some((s) => s.bold)) piece = `<b>${piece}</b>`;
      const color = on.find((s) => s.color)?.color;
      if (color) piece = `<font color="${color}">${piece}</font>`;
      const size = on.find((s) => s.size)?.size;
      if (size) piece = `<font size="${EDITOR_FONT_SIZE[size]}">${piece}</font>`;
      html += piece;
    }
    return html;
  };

  // Mục danh sách lồng theo bậc thụt: giữ một chồng các thẻ ul / ol đang mở
  let out = "";
  const open: Array<"ul" | "ol"> = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) out += `</${open.pop()}>`;
  };
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]! - 1 : text.length;
    const list = spans.find((s) => s.list && s.start === start)?.list ?? null;
    const indent = Math.max(0, ...spans.filter((s) => s.indent && s.start === start).map((s) => s.indent!));
    const content = lineHtml(start, end);
    if (!list) {
      closeTo(0);
      const inner = content || "<br>";
      out += indent > 0 ? `${"<blockquote>".repeat(indent)}${inner}${"</blockquote>".repeat(indent)}` : `<div>${inner}</div>`;
      return;
    }
    const tag = list === "bullet" ? "ul" : "ol";
    const depth = indent + 1;
    closeTo(depth);
    if (open.length === depth && open[depth - 1] !== tag) closeTo(depth - 1);
    while (open.length < depth) {
      out += `<${tag}>`;
      open.push(tag);
    }
    out += `<li>${content || "<br>"}</li>`;
  });
  closeTo(0);
  return out;
}
