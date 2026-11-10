import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRichSegments, findLinks, shortenLongUrl } from "./rich-text-segments";

const span = (start: number, end: number, extra: Record<string, unknown>) => ({
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

describe("chữ có định dạng + link kiểu Zalo", () => {
  it("cắt đúng đoạn đậm/màu và đoạn chữ thường, đoạn chồng nhau gộp kiểu", () => {
    const segs = buildRichSegments("TIÊU ĐỀ và chữ", [span(0, 7, { bold: true, color: "#db342e", size: "big" }), span(4, 7, { italic: true })]);
    assert.deepEqual(
      segs.map((s) => [s.text, s.style.bold, s.style.italic, s.style.color, s.style.size]),
      [
        ["TIÊU", true, false, "#db342e", "big"],
        [" ĐỀ", true, true, "#db342e", "big"],
        [" và chữ", false, false, null, null],
      ],
    );
  });

  it("link http(s) thành link, bỏ dấu câu cuối; scheme lạ và màu sai không lọt qua", () => {
    assert.deepEqual(
      findLinks("Đăng ký: https://forms.gle/ExampleFormLink01. Xem (https://a.vn/x) javascript:alert(1)").map((l) => l.href),
      ["https://forms.gle/ExampleFormLink01", "https://a.vn/x"],
    );
    const segs = buildRichSegments("Link: https://a.vn/b", [span(0, 20, { color: "red;position:fixed" })]);
    assert.deepEqual(
      segs.map((s) => [s.text, s.href, s.style.color]),
      [
        ["Link: ", null, null],
        ["https://a.vn/b", "https://a.vn/b", null],
      ],
    );
  });

  it("chữ không định dạng, không link: một đoạn duy nhất", () => {
    assert.deepEqual(buildRichSegments("hello", []), [
      { text: "hello", href: null, style: { bold: false, italic: false, underline: false, strike: false, color: null, size: null } },
    ]);
  });
});

describe("rút gọn link dài như Zalo PC", () => {
  it("link quá dài: 60 ký tự đầu + ... + 60 ký tự cuối; link vừa phải giữ nguyên", () => {
    const long = `https://example.org/articles/AbCdEfGhIjKlMnOpQrSt?fbclid=${"x".repeat(150)}_aem_end`;
    const shown = shortenLongUrl(long);
    assert.equal(shown, `${long.slice(0, 60)}...${long.slice(-60)}`);
    assert.ok(shown.endsWith("_aem_end"));
    const medium = "https://example.org/forum/thread/12345/reply/67890?ref=mau-thu-nghiem&page=2#cuoi";
    assert.equal(shortenLongUrl(medium), medium);
  });
});
