import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { defaultSendSettings, getSendSettings, sendSettingsSchema, updateSendSettings } from "./send-settings-store.js";

describe("cài đặt tra số điện thoại", () => {
  it("mặc định tra số 100/ngày, nhịp 5-20 giây", () => {
    const s = getSendSettings(openArchiveDatabase(":memory:"), parseEnv({}));
    assert.equal(s.lookupDailyCap, 100);
    assert.equal(s.lookupMinGapSeconds, 5);
    assert.equal(s.lookupMaxGapSeconds, 20);
  });

  it("env đổi được mặc định", () => {
    const env = parseEnv({ PHONE_LOOKUP_DAILY_CAP: "40", PHONE_LOOKUP_MIN_GAP_SECONDS: "10", PHONE_LOOKUP_MAX_GAP_SECONDS: "30" });
    const s = defaultSendSettings(env);
    assert.deepEqual([s.lookupDailyCap, s.lookupMinGapSeconds, s.lookupMaxGapSeconds], [40, 10, 30]);
  });

  it("từ chối nhịp tra ngắn nhất > dài nhất", () => {
    const defaults = defaultSendSettings(parseEnv({}));
    assert.equal(sendSettingsSchema.safeParse({ ...defaults, lookupMinGapSeconds: 30, lookupMaxGapSeconds: 10 }).success, false);
  });

  it("dashboard sửa trần tra số thì lưu và đọc lại", () => {
    const db = openArchiveDatabase(":memory:");
    const env = parseEnv({});
    assert.equal(updateSendSettings(db, env, { lookupDailyCap: 30 }).ok, true);
    assert.equal(getSendSettings(db, env).lookupDailyCap, 30);
  });
});
