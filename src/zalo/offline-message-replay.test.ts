import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ThreadType, type API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { createMissedMessageRequester } from "./offline-message-replay.js";

describe("xin bù tin lỡ", () => {
  it("mỗi lần kết nối một lượt: tin 1-1 ngay, tin nhóm sau vài giây; nối lại liền thì không xin lại", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const asked: ThreadType[] = [];
      const api = { listener: { requestOldMessages: (t: ThreadType) => asked.push(t) } } as unknown as API;
      let clock = 0;
      const r = createMissedMessageRequester(api, createSilentLogger(), { minIntervalMs: 600_000, now: () => clock, random: () => 0.5 });

      r.onConnected();
      assert.deepEqual(asked, [ThreadType.User], "tin nhóm chưa xin ngay");
      mock.timers.tick(3_499);
      assert.deepEqual(asked, [ThreadType.User]);
      mock.timers.tick(1);
      assert.deepEqual(asked, [ThreadType.User, ThreadType.Group]);

      // Mạng chập chờn: nối lại sau 2 phút thì bỏ qua
      clock += 120_000;
      r.onConnected();
      mock.timers.tick(10_000);
      assert.equal(asked.length, 2);

      // Sau 10 phút thì xin lại
      clock += 600_000;
      r.onConnected();
      r.stop();
      mock.timers.tick(10_000);
      assert.deepEqual(asked.slice(2), [ThreadType.User], "dừng listener thì hủy lượt tin nhóm đang hẹn");
    } finally {
      mock.timers.reset();
    }
  });
});
