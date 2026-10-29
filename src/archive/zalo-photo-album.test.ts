import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { photoAlbumOf } from "./zalo-photo-album.js";

describe("album ảnh Zalo (nhiều ảnh gửi cùng lúc)", () => {
  it("ảnh trong album: mã album, vị trí, tổng số ảnh", () => {
    const params = JSON.stringify({ group_layout_id: 1700000000102, id_in_group: 3, total_item_in_group: 6, is_group_layout: 1 });
    assert.deepEqual(photoAlbumOf(params), { id: "1700000000102", index: 3, total: 6 });
  });

  it("ảnh lẻ, params hỏng hoặc thiếu mã album: không phải album", () => {
    assert.equal(photoAlbumOf(JSON.stringify({ width: 1024, hd: "https://f.zdn.vn/a.jpg" })), null);
    assert.equal(photoAlbumOf(JSON.stringify({ group_layout_id: 1, is_group_layout: 0 })), null);
    assert.equal(photoAlbumOf("{hỏng"), null);
    assert.equal(photoAlbumOf(null), null);
  });
});
