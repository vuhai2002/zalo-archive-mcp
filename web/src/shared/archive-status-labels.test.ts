import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unavailableFileLabel } from "./archive-status-labels";
import { opensInBrowser } from "./same-origin-media-url";

describe("file chưa xem được: chữ báo trước trong danh sách", () => {
  it("Zalo đã xóa thì 'Đã hết hạn' như Zalo PC; file đã tải thì không báo; còn lại theo trạng thái", () => {
    assert.equal(unavailableFileLabel({ status: "failed", renewState: "deleted" }), "Đã hết hạn");
    assert.equal(unavailableFileLabel({ status: "done", renewState: null }), null);
    assert.equal(unavailableFileLabel({ status: "failed", renewState: null }), "Tải hỏng");
    assert.equal(unavailableFileLabel({ status: "failed", renewState: "gave_up" }), "Link hết hạn");
    assert.equal(unavailableFileLabel({ status: "removed", renewState: null }), "Đã xóa file khỏi kho");
  });
});

describe("file mở được trong tab bằng trình xem của trình duyệt", () => {
  it("PDF, ảnh, văn bản, nhạc, video thì mở; SVG, Word, không rõ kiểu thì tải về", () => {
    for (const m of ["application/pdf", "image/jpeg", "text/plain; charset=utf-8", "audio/mpeg", "video/mp4"]) assert.equal(opensInBrowser(m), true, m);
    for (const m of ["image/svg+xml", "application/msword", "application/octet-stream", null]) assert.equal(opensInBrowser(m), false, String(m));
  });
});
