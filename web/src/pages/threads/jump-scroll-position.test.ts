import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jumpScrollTop } from "./jump-scroll-position";

describe("vị trí cuộn khi nhảy tới một tin", () => {
  it("tin ngắn: nằm giữa khung chat", () => {
    // Khung cao 593, tin cao 116 đang ở cách mép trên 1000px: tin nằm giữa thì cách mép trên (593 - 116) / 2
    const top = jumpScrollTop({ itemTop: 1100, itemHeight: 116, rootTop: 100, rootHeight: 593, scrollTop: 2000 });
    assert.equal(top, Math.round(2000 + 1000 - (593 - 116) / 2));
  });

  it("tin cao hơn khung: đầu tin sát mép trên (chừa 12px), không bị khuất", () => {
    assert.equal(jumpScrollTop({ itemTop: 1100, itemHeight: 840, rootTop: 100, rootHeight: 593, scrollTop: 2000 }), 2000 + 1000 - 12);
  });

  it("không cuộn quá đầu danh sách", () => {
    assert.equal(jumpScrollTop({ itemTop: 105, itemHeight: 50, rootTop: 100, rootHeight: 593, scrollTop: 0 }), 0);
  });
});
