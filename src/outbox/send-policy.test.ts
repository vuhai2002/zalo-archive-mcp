import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { defaultSendSettings } from "../storage/send-settings-store.js";
import { evaluateSendPolicy, randomGapMs, type SendPolicyInput } from "./send-policy.js";

const settings = defaultSendSettings(parseEnv({}));
const NOW = new Date("2026-10-28T03:00:00.000Z");

const base = (o: Partial<SendPolicyInput> = {}): SendPolicyInput => ({
  now: NOW,
  localHour: 10,
  killed: false,
  killReason: null,
  mode: "single",
  recipient: { threadType: "user", isFriend: false },
  lastAttemptAt: null,
  lastBatchAttemptAt: null,
  batchGapMs: 60_000,
  batchSentToday: 0,
  settings,
  nextBatchWindowOpenAt: "2026-10-29T00:00:00.000Z",
  tomorrowBatchWindowOpenAt: "2026-10-29T00:00:00.000Z",
  ...o,
});

describe("evaluateSendPolicy - tin lẻ (người dùng chốt: thả cửa)", () => {
  it("gửi được cho cả người không phải bạn bè, lúc nửa đêm, dù đã gửi nhiều", () => {
    assert.deepEqual(evaluateSendPolicy(base({ localHour: 2, batchSentToday: 9999 })), { action: "send" });
  });

  it("chỉ chờ đủ vài giây kể từ tin trước", () => {
    const d = evaluateSendPolicy(base({ lastAttemptAt: new Date(NOW.getTime() - 1_000) }));
    assert.deepEqual(d.action === "wait" && [d.scope, d.retryAt], ["global", "2026-10-28T03:00:02.000Z"]);
    assert.equal(evaluateSendPolicy(base({ lastAttemptAt: new Date(NOW.getTime() - 3_000) })).action, "send");
  });

  it("kill switch chặn cả tin lẻ", () => {
    assert.equal(evaluateSendPolicy(base({ killed: true, killReason: "x" })).action, "wait");
  });
});

describe("evaluateSendPolicy - lô gửi nhiều người", () => {
  const batch = (o: Partial<SendPolicyInput> = {}) =>
    base({ mode: "batch", recipient: { threadType: "user", isFriend: true }, ...o });

  it("không phải bạn bè thì từ chối; nhóm cũng từ chối (lô chỉ tới bạn bè)", () => {
    assert.equal(evaluateSendPolicy(batch({ recipient: { threadType: "user", isFriend: false } })).action, "reject");
    assert.equal(evaluateSendPolicy(batch({ recipient: { threadType: "group", isFriend: false } })).action, "reject");
  });

  it("ngoài khung giờ / đủ trần ngày / chưa đủ nhịp: chỉ dời riêng tin lô (scope item)", () => {
    for (const o of [
      { localHour: settings.batchWindowEndHour },
      { localHour: settings.batchWindowStartHour - 1 },
      { batchSentToday: settings.batchDailyCap },
      { lastBatchAttemptAt: new Date(NOW.getTime() - 10_000) },
    ]) {
      const d = evaluateSendPolicy(batch(o));
      assert.equal(d.action === "wait" && d.scope, "item", JSON.stringify(o));
    }
    assert.equal(evaluateSendPolicy(batch({ lastBatchAttemptAt: new Date(NOW.getTime() - 61_000) })).action, "send");
  });

  it("randomGapMs nằm trong [min, max]", () => {
    assert.equal(randomGapMs(45, 180, () => 0), 45_000);
    assert.equal(randomGapMs(45, 180, () => 1), 180_000);
  });
});
