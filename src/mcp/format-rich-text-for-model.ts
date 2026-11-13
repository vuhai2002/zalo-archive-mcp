import type { TextStyleSpan } from "../storage/message-text-styles.js";

/**
 * Tin có danh sách / thụt lề của Zalo: chữ gốc KHÔNG chứa dấu đầu dòng hay số thứ tự (Zalo tự vẽ từ mã `lst_*` / `ind_*`),
 * nên đưa nguyên chữ cho model thì các mục danh sách thành những dòng rời. Ở đây thêm lại "- " / "1. " và thụt 2 khoảng
 * trắng mỗi bậc, đúng cách viết markdown mà send_message cũng hiểu. Chỉ đổi chữ ĐƯA CHO MODEL; kho giữ nguyên. Module thuần.
 *
 * Đánh số như danh sách HTML: các dòng đánh số liền nhau cùng bậc đếm tiếp; bậc sâu hơn đếm riêng; dòng gạch đầu dòng cùng
 * bậc hay dòng thường cắt mạch đếm.
 */
export function textWithListMarkers(text: string, spans: TextStyleSpan[]): string {
  if (!spans.some((s) => s.list || s.indent)) return text;
  const counters = new Map<number, number>();
  let start = 0;
  return text
    .split("\n")
    .map((line) => {
      const lineStart = start;
      start += line.length + 1;
      const list = spans.find((s) => s.list && s.start === lineStart)?.list ?? null;
      const indent = Math.max(0, ...spans.filter((s) => s.indent && s.start === lineStart).map((s) => s.indent!));
      for (const level of [...counters.keys()]) if (level > indent || !list) counters.delete(level);
      let marker = "";
      if (list === "number") {
        const n = (counters.get(indent) ?? 0) + 1;
        counters.set(indent, n);
        marker = `${n}. `;
      } else if (list === "bullet") {
        counters.delete(indent);
        marker = "- ";
      }
      return `${"  ".repeat(indent)}${marker}${line}`;
    })
    .join("\n");
}
