import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "./env-schema.js";

describe("parseEnv", () => {
  it("không cần biến nào: mọi thứ có mặc định (người dùng không phải sửa .env)", () => {
    const env = parseEnv({});
    assert.equal(env.OFFLINE_REPLAY_ENABLED, true);
    assert.equal(env.OFFLINE_REPLAY_MIN_INTERVAL_MINUTES, 10);
    assert.equal(env.ZALO_LOGIN_COOLDOWN_SECONDS, 30);
    assert.equal(env.DIRECTORY_CONTACT_LOOKUP_GAP_SECONDS, 60);
    assert.equal(env.DIRECTORY_RATE_LIMIT_PAUSE_MINUTES, 30);
    assert.equal(env.SEND_SINGLE_MIN_GAP_SECONDS, 3);
    assert.equal(env.SEND_BATCH_MIN_GAP_SECONDS, 45);
    assert.equal(env.DASHBOARD_HOST, "127.0.0.1");
    assert.equal(env.ARCHIVE_TIMEZONE, "Asia/Ho_Chi_Minh");
    assert.deepEqual(env.MEDIA_ALLOWED_HOST_SUFFIXES, [
      "zdn.vn",
      "zadn.vn",
      "zalo.me",
      "zaloapp.com",
      "zalo.vn",
      "dlfl.vn",
      "flchat.vn",
      "dlmd.me",
      "mdchat.me",
      "media-ten.z-cdn.me",
      "media.tenor.com",
    ]);
    assert.equal(env.CREDENTIALS_ENCRYPTION_KEY, undefined);
  });

  it('chuỗi "false" là false thật (không như z.coerce.boolean)', () => {
    const env = parseEnv({ MEDIA_DOWNLOAD_ENABLED: "false", OFFLINE_REPLAY_ENABLED: "0" });
    assert.equal(env.MEDIA_DOWNLOAD_ENABLED, false);
    assert.equal(env.OFFLINE_REPLAY_ENABLED, false);
  });

  it("giá trị rỗng (KEY=) dùng mặc định", () => {
    const env = parseEnv({ SEND_BATCH_DAILY_CAP: "", CREDENTIALS_ENCRYPTION_KEY: "  " });
    assert.equal(env.SEND_BATCH_DAILY_CAP, 100);
    assert.equal(env.CREDENTIALS_ENCRYPTION_KEY, undefined);
  });

  it("từ chối cấu hình mâu thuẫn và timezone sai", () => {
    assert.throws(
      () => parseEnv({ SEND_BATCH_MIN_GAP_SECONDS: "200", SEND_BATCH_MAX_GAP_SECONDS: "100" }),
      /SEND_BATCH_MIN_GAP_SECONDS/,
    );
    assert.throws(
      () => parseEnv({ SEND_BATCH_WINDOW_START_HOUR: "21", SEND_BATCH_WINDOW_END_HOUR: "8" }),
      /SEND_BATCH_WINDOW_START_HOUR/,
    );
    assert.throws(() => parseEnv({ ARCHIVE_TIMEZONE: "Mars/Base" }), /ARCHIVE_TIMEZONE/);
    assert.throws(() => parseEnv({ CREDENTIALS_ENCRYPTION_KEY: "abc" }), /CREDENTIALS/);
  });
});
