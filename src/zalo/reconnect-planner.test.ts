import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReconnectPlanner } from "./reconnect-planner.js";

const opts = { baseDelayMs: 1000, maxDelayMs: 8000, duplicateWaitMs: 900_000, giveUpAfterFlaps: 4, stableAfterMs: 30_000 };

describe("ReconnectPlanner", () => {
  it("rớt liên tiếp không kịp đứng: backoff tăng gấp đôi tới trần, rồi bỏ cuộc", () => {
    const p = new ReconnectPlanner(opts);
    const delays: number[] = [];
    let t = 0;
    for (let i = 0; i < 3; i++) {
      p.markConnected(t);
      const d = p.markClosed(t + 100, 1006, 0);
      assert.equal(d.action, "reconnect");
      if (d.action === "reconnect") delays.push(d.delayMs);
      t += 10_000;
    }
    assert.deepEqual(delays, [1000, 2000, 4000]);
    p.markConnected(t);
    assert.deepEqual(p.markClosed(t + 100, 1006, 0), { action: "give_up", flaps: 4 });
  });

  it("kết nối đứng đủ lâu rồi mới rớt: reset về nhịp nhanh", () => {
    const p = new ReconnectPlanner(opts);
    p.markConnected(0);
    p.markClosed(100, 1006, 0);
    p.markConnected(1000);
    p.markClosed(1100, 1006, 0);
    p.markConnected(10_000);
    const d = p.markClosed(10_000 + 60_000, 1006, 0);
    assert.deepEqual(d, { action: "reconnect", delayMs: 1000, reason: "backoff", flaps: 0 });
  });

  it("mất mạng (chưa từng mở được kết nối): thử mãi theo backoff tới trần, không bỏ cuộc", () => {
    const p = new ReconnectPlanner(opts);
    let last;
    for (let i = 0; i < 20; i++) last = p.markClosed(i * 10_000, 1006, 0, true);
    assert.deepEqual(last, { action: "reconnect", delayMs: 8000, reason: "backoff", flaps: 0 });
  });

  it("lỗi mạng NHƯNG kết nối đã mở rồi rớt ngay thì vẫn tính là chớp-tắt", () => {
    const p = new ReconnectPlanner(opts);
    p.markConnected(0);
    const d = p.markClosed(100, 1006, 0, true);
    assert.equal(d.action === "reconnect" && d.flaps, 1);
  });

  it("bị phiên Zalo Web khác đá (3000): chờ lâu, không nối ngay", () => {
    const p = new ReconnectPlanner(opts);
    p.markConnected(0);
    const d = p.markClosed(120_000, 3000, 5);
    assert.deepEqual(d, { action: "reconnect", delayMs: 900_005, reason: "duplicate_session", flaps: 0 });
  });

  it("lần 3000 đầu tiên (vừa mở máy) thử lại sau 1 phút; bị lại mới chờ lâu; kết nối đứng lại thì tính lại từ đầu", () => {
    const p = new ReconnectPlanner({ ...opts, duplicateFirstRetryMs: 60_000 });
    p.markConnected(0);
    assert.deepEqual(p.markClosed(100, 3000, 5), { action: "reconnect", delayMs: 60_005, reason: "duplicate_session", flaps: 1 });
    p.markConnected(60_100);
    assert.deepEqual(p.markClosed(60_200, 3000, 5), { action: "reconnect", delayMs: 900_005, reason: "duplicate_session", flaps: 2 });
    p.markConnected(1_000_000);
    const again = p.markClosed(2_000_000, 3000, 0);
    assert.deepEqual(again, { action: "reconnect", delayMs: 60_000, reason: "duplicate_session", flaps: 0 }, "đã đứng đủ lâu: lần 3000 kế là lần đầu");
  });

  it("đóng hai lần không có kết nối xen giữa thì lần sau không được tính là đứng", () => {
    const p = new ReconnectPlanner(opts);
    p.markConnected(0);
    p.markClosed(60_000, 1006, 0);
    const d = p.markClosed(200_000, 1006, 0);
    assert.equal(d.action === "reconnect" && d.flaps, 1);
  });
});
