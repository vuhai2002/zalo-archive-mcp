import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextStyleSpan } from "../storage/message-text-styles.js";
import { textWithListMarkers } from "./format-rich-text-for-model.js";

const span = (start: number, end: number, extra: Partial<TextStyleSpan>): TextStyleSpan => ({
  start,
  end,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  size: null,
  ...extra,
});

describe("chữ đưa cho model: thêm lại dấu danh sách", () => {
  it("tin không có danh sách / thụt lề giữ nguyên, kể cả có đậm / màu", () => {
    assert.equal(textWithListMarkers("Chào thử\nDòng năm", [span(0, 4, { bold: true })]), "Chào thử\nDòng năm");
  });

  it("gạch đầu dòng thành '- ', đánh số đếm liền mạch, thụt lề 2 khoảng trắng mỗi bậc", () => {
    const text = "Danh mục thử\nMục hai\nMục bốn\nMục bảy\nMục tám\nDòng năm\nDòng sáu";
    const spans = [
      span(13, 20, { list: "bullet" }),
      span(21, 28, { list: "number" }),
      span(29, 36, { list: "bullet" }),
      span(29, 36, { indent: 1 }),
      span(37, 44, { list: "number" }),
      span(54, 62, { list: "number" }),
    ];
    assert.equal(
      textWithListMarkers(text, spans),
      ["Danh mục thử", "- Mục hai", "1. Mục bốn", "  - Mục bảy", "2. Mục tám", "Dòng năm", "1. Dòng sáu"].join("\n"),
    );
  });

  it("dòng thường thụt lề cũng thụt 2 khoảng trắng mỗi bậc", () => {
    assert.equal(textWithListMarkers("A\nB", [span(2, 3, { indent: 2 })]), "A\n    B");
  });
});
