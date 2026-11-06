import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMentions, withMentionNames } from "./zalo-mention-names.js";

const bold = (start: number, end: number) => ({ start, end, bold: true, italic: false, underline: false, strike: false, color: null, size: null });

describe("nhắc tên (@) trong tin như Zalo", () => {
  it("đọc danh sách nhắc tên Zalo gửi kèm; dữ liệu lạ thì bỏ", () => {
    assert.deepEqual(parseMentions('[{"uid":"849","pos":3,"len":9,"type":0},{"uid":"-1","pos":20,"len":4,"type":1},{"pos":"x"}]'), [
      { uid: "849", pos: 3, len: 9, type: 0 },
      { uid: "-1", pos: 20, len: 4, type: 1 },
    ]);
    assert.deepEqual(parseMentions("không phải JSON"), []);
    assert.deepEqual(parseMentions(null), []);
  });

  it("tô nhắc tên; người có tên gợi nhớ thì hiện tên gợi nhớ như Zalo PC, định dạng phía sau dời theo", () => {
    const text = "Ừm @Khuê Lục mai gửi bài, @All nhé";
    const mentions = [
      { uid: "849", pos: 3, len: 9, type: 0 },
      { uid: "-1", pos: 26, len: 4, type: 1 },
    ];
    const r = withMentionNames(text, [bold(31, 34)], mentions, (uid) => (uid === "849" ? "Lục Khuê Mẫn" : null));
    assert.equal(r.text, "Ừm @Lục Khuê Mẫn mai gửi bài, @All nhé");
    const mentionSpans = r.spans.filter((s) => s.mention).map((s) => r.text.slice(s.start, s.end));
    assert.deepEqual(mentionSpans, ["@Lục Khuê Mẫn", "@All"]);
    const b = r.spans.find((s) => s.bold)!;
    assert.equal(r.text.slice(b.start, b.end), "nhé", "đoạn in đậm dời theo tên dài hơn");
  });

  it("không có tên gợi nhớ thì giữ chữ gốc, chỉ tô; vị trí lệch khỏi chữ '@' thì bỏ qua chỗ đó", () => {
    const r = withMentionNames("Chào @Lan nhé", [], [{ uid: "1", pos: 5, len: 4, type: 0 }, { uid: "2", pos: 0, len: 5, type: 0 }], () => null);
    assert.equal(r.text, "Chào @Lan nhé");
    assert.deepEqual(r.spans.filter((s) => s.mention).map((s) => [s.start, s.end]), [[5, 9]]);
  });
});
