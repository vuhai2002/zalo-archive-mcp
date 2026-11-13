import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToZaloStyles } from "./markdown-to-zalo-styles.js";

describe("chữ kiểu markdown của Claude -> định dạng Zalo", () => {
  it("chữ không có dấu nào giữ nguyên, không định dạng", () => {
    assert.deepEqual(markdownToZaloStyles("Hẹn họp lúc 9h nhé"), { text: "Hẹn họp lúc 9h nhé", styles: [] });
  });

  it("đậm, nghiêng (* và _), gạch ngang; lồng nhau gộp mã như Zalo", () => {
    assert.deepEqual(markdownToZaloStyles("**Chào thử** và *nghiêng* _thêm_ ~~ẩn~~ **đậm *lồng***"), {
      text: "Chào thử và nghiêng thêm ẩn đậm lồng",
      styles: [
        { start: 0, len: 8, st: "b" },
        { start: 12, len: 7, st: "i" },
        { start: 20, len: 4, st: "i" },
        { start: 25, len: 2, st: "s" },
        { start: 28, len: 4, st: "b" },
        { start: 32, len: 4, st: "b,i" },
      ],
    });
  });

  it("thẻ gạch chân, 4 màu, 3 cỡ chữ; màu lồng trong màu thì màu trong thắng", () => {
    const r = markdownToZaloStyles("<huge><red>Dòng mở đầu</red></huge> <u>gạch</u> <green>xanh <orange>cam</orange></green> <small>nhỏ</small> <big>to</big> <yellow>v</yellow>");
    assert.equal(r.text, "Dòng mở đầu gạch xanh cam nhỏ to v");
    assert.deepEqual(r.styles, [
      { start: 0, len: 11, st: "c_db342e,f_20" },
      { start: 12, len: 4, st: "u" },
      { start: 17, len: 5, st: "c_15a85f" },
      { start: 22, len: 3, st: "c_f27806" },
      { start: 26, len: 3, st: "f_13" },
      { start: 30, len: 2, st: "f_18" },
      { start: 33, len: 1, st: "c_f7b503" },
    ]);
  });

  it("danh sách: gạch đầu dòng, đánh số, bậc con theo độ thụt (2 hay 4 khoảng trắng đều được); dòng thường cắt mạch", () => {
    const md = ["Danh mục thử", "- Mục hai", "    - Mục bốn", "- **Mục bảy**", "1. Mục tám", "   1) Dòng năm", "Dòng sáu"].join("\n");
    const r = markdownToZaloStyles(md);
    assert.equal(r.text, "Danh mục thử\nMục hai\nMục bốn\nMục bảy\nMục tám\nDòng năm\nDòng sáu");
    assert.deepEqual(r.styles, [
      { start: 29, len: 7, st: "b" },
      { start: 13, len: 7, st: "lst_1" },
      { start: 21, len: 7, st: "lst_1" },
      { start: 21, len: 7, st: "ind_10" },
      { start: 29, len: 7, st: "lst_1" },
      { start: 37, len: 7, st: "lst_2" },
      { start: 45, len: 8, st: "lst_2" },
      { start: 45, len: 8, st: "ind_10" },
    ]);
  });

  it("giữ nguyên chữ khi dấu không đúng chỗ: phép nhân, tên có gạch dưới, dấu thiếu cặp, dấu thoát, số năm, thẻ lạ", () => {
    for (const s of ["2*3*4 = 24", "ten_bien_x", "5 * 3", "**dấu lẻ", "a ~~ b", "<b>x</b>", "2026. Mốc thử", "-sát chữ"]) {
      assert.deepEqual(markdownToZaloStyles(s), { text: s, styles: [] }, s);
    }
    assert.deepEqual(markdownToZaloStyles("\\*không nghiêng\\*"), { text: "*không nghiêng*", styles: [] });
  });
});
