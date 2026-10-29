import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkPreviewOf } from "./zalo-link-preview.js";

describe("thẻ link Zalo (recommened.link)", () => {
  it("chỉ dán URL: thẻ có URL + tên miền, không lặp tiêu đề", () => {
    const url = "https://www.facebook.com/share/p/ExampleId1/";
    assert.deepEqual(linkPreviewOf({ action: "recommened.link", title: url, href: url, description: url }), {
      url,
      title: null,
      description: null,
      domain: "www.facebook.com",
    });
  });

  it("bài có tiêu đề + mô tả; link lấy từ href", () => {
    const p = linkPreviewOf({ action: "recommened.link", title: "Một bài viết mẫu", href: "https://fb.watch/x", description: "Kênh mẫu A" });
    assert.deepEqual(p, { url: "https://fb.watch/x", title: "Một bài viết mẫu", description: "Kênh mẫu A", domain: "fb.watch" });
  });

  it("không có link http(s) hợp lệ, hoặc không phải tin link: null", () => {
    assert.equal(linkPreviewOf({ action: "recommened.link", title: "x", href: "javascript:alert(1)" }), null);
    assert.equal(linkPreviewOf({ action: "recommened.misscall", title: "sendBubbleMessage" }), null);
    assert.equal(linkPreviewOf(null), null);
  });
});
