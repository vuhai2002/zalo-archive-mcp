import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldablePollRuns, pollCardAnchors } from "./poll-notice-runs";

const vote = (id: number) => ({ id, msgType: "group.poll", poll: { pollId: "1", action: "vote" } });
const create = (id: number) => ({ id, msgType: "group.poll", poll: { pollId: "1", action: "create" } });
const text = (id: number) => ({ id, msgType: "webchat", poll: null });

describe("gộp dòng bình chọn liền nhau", () => {
  it("từ 3 dòng liền nhau: ẩn các dòng trước, dòng cuối hiện kèm Xem thêm", () => {
    const runs = foldablePollRuns([text(1), vote(2), vote(3), vote(4), vote(5), text(6)]);
    assert.deepEqual(
      [...runs.entries()].map(([id, r]) => [id, r.role, r.hiddenCount, r.runStart]),
      [
        [2, "hidden", 3, 2],
        [3, "hidden", 3, 2],
        [4, "hidden", 3, 2],
        [5, "last", 3, 2],
      ],
    );
  });

  it("hai dòng thì để nguyên; tin tạo bình chọn (có thẻ riêng) cắt chuỗi và không bị ẩn", () => {
    assert.equal(foldablePollRuns([vote(1), vote(2), text(3)]).size, 0);
    const runs = foldablePollRuns([vote(1), vote(2), create(3), vote(4), vote(5), vote(6)]);
    assert.equal(runs.has(3), false);
    assert.deepEqual([...runs.keys()], [4, 5, 6]);
  });
});

describe("chỗ đặt thẻ bình chọn", () => {
  const ev = (id: number, pollId: string, action: string) => ({ id, msgType: "group.poll", poll: { pollId, action } });

  it("mỗi cuộc bình chọn một thẻ, ở dòng MỚI nhất của cuộc đó như Zalo PC (không ở tin tạo nếu đã có người bình chọn sau)", () => {
    const msgs = [ev(1, "A", "create"), ev(2, "A", "vote"), text(3), ev(4, "B", "create"), ev(5, "A", "vote"), text(6)];
    assert.deepEqual([...pollCardAnchors(msgs)].sort(), [4, 5]);
  });

  it("chưa ai bình chọn thì thẻ ở tin tạo; không có bình chọn thì không có thẻ", () => {
    assert.deepEqual([...pollCardAnchors([create(1), text(2)])], [1]);
    assert.deepEqual([...pollCardAnchors([text(1), text(2)])], []);
  });
});
