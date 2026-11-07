import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { awayFromLatest, JUMP_TO_LATEST_PX, nextStickToBottom } from "./stick-to-bottom-scroll";

describe("khung chat bám đáy khi ảnh tải xong", () => {
  it("ảnh ở cuối dãn khung ra (vị trí cuộn không đổi): vẫn bám đáy để lần tải xong kéo xuống", () => {
    assert.equal(nextStickToBottom({ stick: true, atLatest: true, scrollTop: 2000, prevScrollTop: 2000, distanceFromBottom: 400 }), true);
  });

  it("người dùng kéo lên khỏi đáy thì thôi bám; kéo về gần đáy thì bám lại", () => {
    assert.equal(nextStickToBottom({ stick: true, atLatest: true, scrollTop: 1500, prevScrollTop: 2000, distanceFromBottom: 500 }), false);
    assert.equal(nextStickToBottom({ stick: false, atLatest: true, scrollTop: 1980, prevScrollTop: 1900, distanceFromBottom: 20 }), true);
  });

  it("đang xem đoạn cũ (nhảy tới tin xa) thì không bám đáy dù cuộn tới cuối phần đã tải", () => {
    assert.equal(nextStickToBottom({ stick: false, atLatest: false, scrollTop: 900, prevScrollTop: 800, distanceFromBottom: 10 }), false);
  });
});

describe("nút về tin mới nhất", () => {
  it("tự kéo lên đọc tin cũ: hiện nút khi cách đáy quá vài tin, sát đáy thì ẩn", () => {
    assert.deepEqual([0, JUMP_TO_LATEST_PX, JUMP_TO_LATEST_PX + 1, 2500].map(awayFromLatest), [false, false, true, true]);
  });
});
