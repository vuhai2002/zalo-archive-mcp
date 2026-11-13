import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { readThread } from "./message-read-queries.js";
import { parseTextStyles } from "./message-text-styles.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("định dạng chữ kiểu Zalo (rtf)", () => {
  it("đọc đậm / nghiêng / màu / cỡ chữ; bỏ mã lạ, màu sai, đoạn rỗng; cắt đoạn vượt quá chữ", () => {
    const params = JSON.stringify({
      styles: [
        { start: 0, len: 5, st: "f_18,b,c_db342e" },
        { start: 6, len: 4, st: "i,u,s" },
        { start: 3, len: 0, st: "b" },
        { start: 1, len: 2, st: "c_red;background:url(x),f_99" },
        { start: 8, len: 50, st: "c_15A85F" },
      ],
    });
    assert.deepEqual(parseTextStyles(params, 12), [
      { start: 0, end: 5, bold: true, italic: false, underline: false, strike: false, color: "#db342e", size: "big" },
      { start: 6, end: 10, bold: false, italic: true, underline: true, strike: true, color: null, size: null },
      { start: 8, end: 12, bold: false, italic: false, underline: false, strike: false, color: "#15a85f", size: null },
    ]);
    assert.deepEqual(parseTextStyles("không phải json", 10), []);
    assert.deepEqual(parseTextStyles(JSON.stringify({ styles: "x" }), 10), []);
    assert.deepEqual(parseTextStyles(null, 10), []);
  });

  it("cỡ Rất lớn, danh sách gạch đầu dòng / đánh số, thụt lề (tối đa 5 bậc); mã rác của Zalo bị bỏ", () => {
    const params = JSON.stringify({
      styles: [
        { start: 0, len: 4, st: "f_20" },
        { start: 5, len: 3, st: "lst_1" },
        { start: 9, len: 3, st: "lst_2" },
        { start: 9, len: 3, st: "ind_20" },
        { start: 13, len: 2, st: "ind_90" },
        { start: 0, len: 4, st: "undefined" },
      ],
    });
    const spans = parseTextStyles(params, 15);
    assert.deepEqual(
      spans.map((s) => [s.start, s.size, s.list ?? null, s.indent ?? null]),
      [
        [0, "xbig", null, null],
        [5, null, "bullet", null],
        [9, null, "number", null],
        [9, null, null, 2],
        [13, null, null, 5],
      ],
    );
  });

  it("tin rtf trong kho trả kèm định dạng; tin chữ thường thì rỗng", () => {
    const db = openArchiveDatabase(":memory:");
    const title = "THƯ MỜI\nchi tiết";
    const raw = { msgType: "webchat", content: { title, action: "rtf", params: JSON.stringify({ styles: [{ start: 0, len: 7, st: "b,c_db342e" }] }) } };
    upsertMessage(db, sampleMessage({ msgId: "1", text: title, rawJson: JSON.stringify(raw) }), { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" });
    upsertMessage(db, sampleMessage({ msgId: "2", rawJson: "không phải json" }), { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" });
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    const styled = rows.find((r) => r.msgId === "1")!;
    assert.equal(styled.textStyles.length, 1);
    assert.equal(title.slice(styled.textStyles[0]!.start, styled.textStyles[0]!.end), "THƯ MỜI");
    assert.deepEqual(rows.find((r) => r.msgId === "2")!.textStyles, [], "raw hỏng không làm lỗi cả truy vấn");
  });
});
