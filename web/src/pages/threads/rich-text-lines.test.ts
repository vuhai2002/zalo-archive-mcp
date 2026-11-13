import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextStyleSpan } from "../../archive-api-types";
import { buildRichBlocks, buildRichLines, hasLineStyles, type RichBlock, type RichList } from "./rich-text-lines";

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

const textOf = (segs: { text: string }[]) => segs.map((s) => s.text).join("");
/** Cây khối dạng gọn để so: dòng thường = chữ; danh sách = { kiểu: [mục, { con }] } */
function view(blocks: RichBlock[]): unknown[] {
  const list = (l: RichList): unknown => ({
    [l.type]: l.items.map((it) => (it.sublists.length ? [it.line ? textOf(it.line.segments) : null, ...it.sublists.map(list)] : textOf(it.line!.segments))),
  });
  return blocks.map((b) => (b.kind === "line" ? textOf(b.line.segments) : list(b.list)));
}
const blocksOf = (text: string, spans: TextStyleSpan[]) => view(buildRichBlocks(buildRichLines(text, spans)));

describe("vẽ tin có danh sách / thụt lề như Zalo", () => {
  it("chỉ tin có danh sách hoặc thụt lề mới vẽ theo dòng", () => {
    assert.equal(hasLineStyles([span(0, 3, { bold: true })]), false);
    assert.equal(hasLineStyles([span(0, 3, { list: "bullet" })]), true);
  });

  it("dòng danh sách liền nhau thành một danh sách; dòng thường cắt ra; đổi kiểu cùng bậc là danh sách mới", () => {
    const text = "Danh mục thử\nMục hai\nMục bốn\nMục bảy\nDòng năm\nDòng sáu";
    const spans = [
      span(13, 20, { list: "bullet" }),
      span(21, 28, { list: "bullet" }),
      span(29, 36, { list: "number" }),
      span(46, 54, { list: "number" }),
    ];
    assert.deepEqual(blocksOf(text, spans), ["Danh mục thử", { bullet: ["Mục hai", "Mục bốn"] }, { number: ["Mục bảy"] }, "Dòng năm", { number: ["Dòng sáu"] }]);
  });

  it("dòng thụt sâu hơn thành danh sách con của mục ngay trên; quay lại bậc ngoài thì tiếp danh sách cũ", () => {
    const text = "A\nB\nC\nD";
    const spans = [
      span(0, 1, { list: "number" }),
      span(2, 3, { list: "bullet" }),
      span(2, 3, { indent: 1 }),
      span(4, 5, { list: "bullet" }),
      span(4, 5, { indent: 1 }),
      span(6, 7, { list: "number" }),
    ];
    assert.deepEqual(blocksOf(text, spans), [{ number: [["A", { bullet: ["B", "C"] }], "D"] }]);
  });

  it("danh sách mở thẳng ở bậc sâu: có mục trống làm chỗ chứa; dòng thường giữ bậc thụt lề", () => {
    const lines = buildRichLines("X\nY", [span(0, 1, { list: "bullet" }), span(0, 1, { indent: 1 }), span(2, 3, { indent: 2 })]);
    assert.deepEqual(view(buildRichBlocks(lines)), [{ bullet: [[null, { bullet: ["X"] }]] }, "Y"]);
    assert.equal(lines[1]!.indent, 2);
  });

  it("định dạng chữ trong dòng giữ nguyên; dòng trống vẫn là một dòng", () => {
    const lines = buildRichLines("Đậm thường\n\nHết", [span(0, 3, { bold: true }), span(12, 15, { indent: 2 })]);
    assert.deepEqual(
      lines[0]!.segments.map((s) => [s.text, s.style.bold]),
      [
        ["Đậm", true],
        [" thường", false],
      ],
    );
    assert.equal(lines[1]!.segments.length, 0);
    assert.deepEqual([lines[2]!.indent, lines[2]!.list], [2, null]);
  });
});
