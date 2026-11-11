import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDocxFile, safeDocxLinkHref } from "./docx-file-rules";

describe("file Word xem ngay trong kho", () => {
  it("nhận .docx theo đuôi tên (không phân biệt hoa thường) hoặc theo kiểu file; .doc, .docm và loại khác thì không", () => {
    assert.equal(isDocxFile("Biên bản họp nhóm tuần 2.docx", null), true);
    assert.equal(isDocxFile("MAU-TAI-LIEU.DOCX ", "application/octet-stream"), true);
    assert.equal(isDocxFile("file", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
    assert.equal(isDocxFile("ban-cu.doc", "application/msword"), false);
    assert.equal(isDocxFile("co-macro.docm", null), false);
    assert.equal(isDocxFile("bang.xlsx", null), false);
    assert.equal(isDocxFile(null, null), false);
  });

  it("link trong file chỉ giữ http / https / mailto; javascript:, file:, data:, tương đối, rỗng bị gỡ", () => {
    assert.equal(safeDocxLinkHref(" https://docs.example.com/mau-1 "), "https://docs.example.com/mau-1");
    assert.equal(safeDocxLinkHref("http://example.com"), "http://example.com/");
    assert.equal(safeDocxLinkHref("mailto:a@b.vn"), "mailto:a@b.vn");
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "file:///C:/x.exe", "data:text/html,<b>x</b>", "/api/media/1", "", null]) {
      assert.equal(safeDocxLinkHref(bad), null, String(bad));
    }
  });
});
