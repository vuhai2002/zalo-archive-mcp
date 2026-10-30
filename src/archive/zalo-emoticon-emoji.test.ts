import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextStyleSpan } from "../storage/message-text-styles.js";
import { emojiForZaloCode, withZaloEmoticons } from "./zalo-emoticon-emoji.js";

const bold = (start: number, end: number): TextStyleSpan => ({
  start,
  end,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  size: null,
});

describe("mã biểu cảm Zalo", () => {
  it("mã đứng riêng thành emoji, không phân biệt hoa thường; dính liền nhau vẫn đổi", () => {
    assert.equal(withZaloEmoticons("Q xem :d rồi :d").text, "Q xem 😁 rồi 😁");
    assert.equal(withZaloEmoticons(":D:>").text, "😁😆");
    assert.equal(withZaloEmoticons("/-heart /-STRONG").text, "❤️ 👍");
    // Ví dụ: "--B" dính sau chữ cách một dấu cách - Zalo vẽ mặt ngước mắt có giọt mồ hôi
    assert.equal(withZaloEmoticons("nay chạy deadline --B").text, "nay chạy deadline 😥");
  });

  it("mã nằm trong chữ khác thì giữ nguyên: giờ, link, 'Note:do'", () => {
    for (const s of ["Note:do việc này", "lúc 10:30", "https://zalo.me/:d", "tỷ số 2:3", "(x-)"]) {
      assert.equal(withZaloEmoticons(s).text, s);
    }
  });

  it("dấu câu ngay sau mã vẫn đổi; mã không có emoji tương ứng (':v') giữ nguyên", () => {
    assert.equal(withZaloEmoticons("ok :d.").text, "ok 😁.");
    assert.equal(withZaloEmoticons("haha :v").text, "haha :v");
  });

  it("định dạng chữ (đậm) dời theo khi mã đổi độ dài", () => {
    // "/-heart" (7) -> "❤️" (2): chữ đậm "Chào" sau nó lùi 5 đơn vị
    const r = withZaloEmoticons("/-heart Chào", [bold(8, 12)]);
    assert.equal(r.text, "❤️ Chào");
    assert.deepEqual(
      r.spans.map((s) => [s.start, s.end]),
      [[3, 7]],
    );
    assert.equal(r.text.slice(r.spans[0]!.start, r.spans[0]!.end), "Chào");
  });

  it("cảm xúc dùng chung bảng: sáu cảm xúc chính và mã lạ", () => {
    assert.deepEqual(
      ["/-heart", "/-strong", ":>", ":o", ":-((", ":-h"].map(emojiForZaloCode),
      ["❤️", "👍", "😆", "😮", "😭", "😡"],
    );
    assert.equal(emojiForZaloCode("/-chuacomaynay"), null);
  });
});
