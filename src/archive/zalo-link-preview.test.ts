import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkPreviewOf } from "./zalo-link-preview.js";

const params = (p: Record<string, unknown>) => JSON.stringify(p);

describe("thẻ link Zalo (recommened.link)", () => {
  it("chỉ dán URL: chữ của tin là URL, thẻ có tên trang + ảnh xem trước + tên miền", () => {
    const url = "https://www.facebook.com/share/p/ExampleId1/";
    assert.deepEqual(
      linkPreviewOf({
        action: "recommened.link",
        title: url,
        href: url,
        description: url,
        thumb: "https://photo-stal-13.zdn.vn/gr/abc/thumb.jpg",
        params: params({ mediaTitle: "Bài viết của Minh", src: "facebook.com", tWidth: 1200, tHeight: 630 }),
      }),
      {
        url,
        text: url,
        textStyles: [],
        title: "Bài viết của Minh",
        description: null,
        domain: "facebook.com",
        thumbUrl: "https://photo-stal-13.zdn.vn/gr/abc/thumb.jpg",
        thumbAspect: 1200 / 630,
      },
    );
  });

  it("gõ chữ kèm link: chữ của tin là TOÀN BỘ chữ đã gõ (không cắt), tên trang lấy từ mediaTitle", () => {
    const text = "Gửi cả nhà biên bản...\n1. Ý một\n2. Ý hai\nhttps://docs.google.com/document/d/1Ab/edit\n\nHết biên bản.";
    const p = linkPreviewOf({
      action: "recommened.link",
      title: text,
      href: "https://docs.google.com/document/d/1Ab/mobilebasic",
      description: "BIÊN BẢN HỌP NHÓM Danh sách việc tuần này",
      thumb: "https://evil.example/track.jpg",
      params: params({ mediaTitle: "Biên bản họp nhóm.docx", src: "docs.google.com" }),
    });
    assert.equal(p?.text, text);
    assert.equal(p?.title, "Biên bản họp nhóm.docx");
    assert.equal(p?.description, "BIÊN BẢN HỌP NHÓM Danh sách việc tuần này");
    assert.equal(p?.thumbUrl, null, "ảnh ngoài CDN Zalo thì bỏ");
    assert.equal(p?.thumbAspect, null);
  });

  it("chữ rỗng hoặc 'undefined' thì chữ của tin là link; thiếu src thì tên miền theo link", () => {
    const p = linkPreviewOf({ action: "recommened.link", title: "undefined", href: "https://zoom.us/j/123", params: params({ mediaTitle: "Tham gia họp" }) });
    assert.deepEqual([p?.text, p?.title, p?.domain], ["https://zoom.us/j/123", "Tham gia họp", "zoom.us"]);
    assert.equal(linkPreviewOf({ action: "recommened.link", title: "", href: "https://vt.tiktok.com/ZS/" })?.text, "https://vt.tiktok.com/ZS/");
  });

  it("không có link http(s) hợp lệ, hoặc không phải tin link: null", () => {
    assert.equal(linkPreviewOf({ action: "recommened.link", title: "x", href: "javascript:alert(1)" }), null);
    assert.equal(linkPreviewOf({ action: "recommened.misscall", title: "sendBubbleMessage" }), null);
    assert.equal(linkPreviewOf(null), null);
  });
});
