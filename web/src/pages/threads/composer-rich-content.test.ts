import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readRichContent, type NodeLike } from "./composer-rich-content-reader";
import { richValueToEditorHtml } from "./composer-rich-content-writer";

/**
 * Dựng cây "giống DOM" từ HTML đơn giản (thẻ, thuộc tính trong ngoặc kép, style inline, &amp; &lt; &gt; &quot; &nbsp;) - đủ
 * cho HTML do ô soạn / trình duyệt sinh ra trong các ca thử, không cần trình duyệt thật.
 */
function parse(html: string): NodeLike {
  const root: NodeLike & { childNodes: NodeLike[] } = { nodeType: 1, nodeName: "DIV", nodeValue: null, childNodes: [] };
  const stack = [root];
  const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const m of html.matchAll(/<\/([a-z0-9]+)>|<([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>|([^<]+)/gi)) {
    const top = stack[stack.length - 1]!;
    if (m[1]) {
      stack.pop();
    } else if (m[2]) {
      const attrs = Object.fromEntries([...(m[3] ?? "").matchAll(/([a-z-]+)="([^"]*)"/gi)].map((a) => [a[1]!.toLowerCase(), decode(a[2]!)]));
      const style = Object.fromEntries(
        (attrs.style ?? "")
          .split(";")
          .map((d) => d.split(":").map((x) => x.trim()))
          .filter((d) => d[0] && d[1])
          .map(([k, v]) => [k!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v!]),
      );
      const el = { nodeType: 1, nodeName: m[2].toUpperCase(), nodeValue: null, childNodes: [] as NodeLike[], getAttribute: (n: string) => attrs[n] ?? null, style };
      top.childNodes.push(el);
      if (!/^(br|img|hr)$/i.test(m[2])) stack.push(el);
    } else if (m[4]) {
      top.childNodes.push({ nodeType: 3, nodeName: "#text", nodeValue: decode(m[4]), childNodes: [] });
    }
  }
  return root;
}

const editor = (html: string) => readRichContent(parse(html), { collapseWhitespace: false });
const pasted = (html: string) => readRichContent(parse(html), { collapseWhitespace: true });

describe("đọc ô soạn tin thành chữ + mã Zalo", () => {
  it("dòng của trình duyệt: dòng đầu là chữ trần, các dòng sau là div; <br> cuối khối không thành dòng trống", () => {
    assert.deepEqual(editor("Một<div>Hai<br></div><div><br></div><div>Bốn</div>"), { text: "Một\nHai\n\nBốn", styles: [] });
    assert.deepEqual(editor("a<br><br>b"), { text: "a\n\nb", styles: [] });
  });

  it("đậm / nghiêng / gạch chân / gạch ngang / màu / cỡ gộp thành mã Zalo, đoạn liền nhau cùng mã gộp làm một", () => {
    const v = editor('<b>Hẹn</b><b> họp</b> <font color="#db342e"><i>lúc 9h</i></font> <font size="6"><u><strike>nhé</strike></u></font>');
    assert.equal(v.text, "Hẹn họp lúc 9h nhé");
    assert.deepEqual(v.styles, [
      { start: 0, len: 7, st: "b" },
      { start: 8, len: 6, st: "i,c_db342e" },
      { start: 15, len: 3, st: "u,s,f_20" },
    ]);
  });

  it("danh sách: mỗi dòng một mục lst phủ trọn dòng; danh sách lồng và blockquote thành bậc thụt lề", () => {
    const v = editor("<ul><li>Một</li><ul><li>Hai</li></ul></ul><ol><li>Ba</li></ol><blockquote><blockquote>Bốn</blockquote></blockquote>");
    assert.equal(v.text, "Một\nHai\nBa\nBốn");
    assert.deepEqual(v.styles, [
      { start: 0, len: 3, st: "lst_1" },
      { start: 4, len: 3, st: "lst_1" },
      { start: 4, len: 3, st: "ind_10" },
      { start: 8, len: 2, st: "lst_2" },
      { start: 11, len: 3, st: "ind_20" },
    ]);
  });

  it("đúng cấu trúc Chrome sinh ra: xuống dòng là ký tự \\n trong chữ, danh sách nằm bên trong thẻ font / b", () => {
    const html =
      '<b><font size="6" color="#db342e">Mục tám\n<ul><li><b><font size="6" color="#db342e">Một</font></b></li>' +
      '<ul><li><b><font size="6" color="#db342e">Hai</font></b></li></ul></ul></font></b>';
    assert.deepEqual(editor(html), {
      text: "Mục tám\nMột\nHai",
      styles: [
        { start: 0, len: 7, st: "b,c_db342e,f_20" },
        { start: 8, len: 3, st: "b,c_db342e,f_20" },
        { start: 12, len: 3, st: "b,c_db342e,f_20" },
        { start: 8, len: 3, st: "lst_1" },
        { start: 12, len: 3, st: "lst_1" },
        { start: 12, len: 3, st: "ind_10" },
      ],
    });
  });

  it("cắt khoảng trắng / dòng trống hai đầu và dời định dạng theo", () => {
    assert.deepEqual(editor("<div><br></div><div>&nbsp; <b>Chào</b> </div>"), { text: "Chào", styles: [{ start: 0, len: 4, st: "b" }] });
  });
});

describe("dán HTML từ nơi khác (đang bật Định dạng)", () => {
  it("chỉ giữ định dạng Zalo có: màu ngoài bảng màu, cỡ lạ, ảnh, script bị bỏ; style inline (chép từ trang web) đọc được", () => {
    const html =
      '<span style="color: rgb(5, 10, 25); font-size: 15px">Thường </span><span style="font-weight: 600; color: rgb(219, 52, 46)">Chữ thử</span>' +
      '<span style="color: #123456; font-size: 16px"> lạ</span><img src="x"><script>alert(1)</script><span style="font-size: 18px; text-decoration-line: underline"> to</span>';
    const v = pasted(html);
    assert.equal(v.text, "Thường Chữ thử lạ to");
    assert.deepEqual(v.styles, [
      { start: 7, len: 7, st: "b,c_db342e" },
      { start: 17, len: 3, st: "u,f_18" },
    ]);
  });

  it("khoảng trắng / xuống dòng trong mã HTML không thành chữ; bong bóng của kho giữ được danh sách qua data-zl-*", () => {
    const html = '<div data-zl-list="number">\n  Mục   bốn\n</div>\n<div data-zl-list="bullet" data-zl-indent="1"><span aria-hidden="true">•</span>Mục hai</div>';
    assert.deepEqual(pasted(html), {
      text: "Mục bốn\nMục hai",
      styles: [
        { start: 0, len: 7, st: "lst_2" },
        { start: 8, len: 7, st: "lst_1" },
        { start: 8, len: 7, st: "ind_10" },
      ],
    });
  });
});

describe("ghi chữ + mã Zalo thành HTML cho ô soạn", () => {
  it("thoát ký tự HTML, không để lọt thẻ lạ", () => {
    const html = richValueToEditorHtml({ text: '<img src=x onerror="a()"> & "b"', styles: [] });
    assert.equal(html, "<div>&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &quot;b&quot;</div>");
  });

  it("ghi rồi đọc lại ra đúng chữ + mã (định dạng chữ, danh sách lồng, thụt lề, dòng trống)", () => {
    const value = {
      text: "Dòng in to\nMục bốn\nMục sáu\nMục hai\n\nThụt hai bậc",
      styles: [
        { start: 0, len: 10, st: "b,c_15a85f,f_18" },
        { start: 11, len: 7, st: "lst_2" },
        { start: 19, len: 7, st: "lst_2" },
        { start: 19, len: 7, st: "ind_10" },
        { start: 27, len: 7, st: "lst_2" },
        { start: 36, len: 12, st: "ind_20" },
      ],
    };
    assert.deepEqual(editor(richValueToEditorHtml(value)), value);
  });
});
