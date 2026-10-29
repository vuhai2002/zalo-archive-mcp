import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "./env-schema.js";

describe("parseEnv", () => {
  it("chỉ cần ZALO_ACCOUNT_ID, còn lại lấy mặc định", () => {
    const env = parseEnv({ ZALO_ACCOUNT_ID: "nick-phu" });
    assert.equal(env.OFFLINE_REPLAY_ENABLED, false);
    assert.equal(env.SEND_SINGLE_MIN_GAP_SECONDS, 3);
    assert.equal(env.SEND_BATCH_MIN_GAP_SECONDS, 45);
    assert.equal(env.DASHBOARD_HOST, "127.0.0.1");
    assert.equal(env.DASHBOARD_PASSWORD, undefined);
    assert.equal(env.ARCHIVE_TIMEZONE, "Asia/Ho_Chi_Minh");
    assert.deepEqual(env.MEDIA_ALLOWED_HOST_SUFFIXES, ["zdn.vn", "zadn.vn", "zalo.me", "zaloapp.com", "zalo.vn"]);
    assert.equal(env.CREDENTIALS_ENCRYPTION_KEY, undefined);
  });

  it('chuỗi "false" là false thật (không như z.coerce.boolean)', () => {
    const env = parseEnv({ ZALO_ACCOUNT_ID: "a", MEDIA_DOWNLOAD_ENABLED: "false", OFFLINE_REPLAY_ENABLED: "1" });
    assert.equal(env.MEDIA_DOWNLOAD_ENABLED, false);
    assert.equal(env.OFFLINE_REPLAY_ENABLED, true);
  });

  it("giá trị rỗng (KEY=) dùng mặc định", () => {
    const env = parseEnv({ ZALO_ACCOUNT_ID: "a", SEND_BATCH_DAILY_CAP: "", CREDENTIALS_ENCRYPTION_KEY: "  " });
    assert.equal(env.SEND_BATCH_DAILY_CAP, 100);
    assert.equal(env.CREDENTIALS_ENCRYPTION_KEY, undefined);
  });

  it("từ chối account id có ký tự lạ (chặn path traversal vào data/)", () => {
    assert.throws(() => parseEnv({ ZALO_ACCOUNT_ID: "../x" }), /ZALO_ACCOUNT_ID/);
    assert.throws(() => parseEnv({ ZALO_ACCOUNT_ID: "Nick Chinh" }), /ZALO_ACCOUNT_ID/);
  });

  it("từ chối cấu hình mâu thuẫn và timezone sai", () => {
    assert.throws(
      () => parseEnv({ ZALO_ACCOUNT_ID: "a", SEND_BATCH_MIN_GAP_SECONDS: "200", SEND_BATCH_MAX_GAP_SECONDS: "100" }),
      /SEND_BATCH_MIN_GAP_SECONDS/,
    );
    assert.throws(
      () => parseEnv({ ZALO_ACCOUNT_ID: "a", SEND_BATCH_WINDOW_START_HOUR: "21", SEND_BATCH_WINDOW_END_HOUR: "8" }),
      /SEND_BATCH_WINDOW_START_HOUR/,
    );
    assert.throws(() => parseEnv({ ZALO_ACCOUNT_ID: "a", ARCHIVE_TIMEZONE: "Mars/Base" }), /ARCHIVE_TIMEZONE/);
    assert.throws(() => parseEnv({ ZALO_ACCOUNT_ID: "a", CREDENTIALS_ENCRYPTION_KEY: "abc" }), /CREDENTIALS/);
    assert.throws(() => parseEnv({ ZALO_ACCOUNT_ID: "a", DASHBOARD_PASSWORD: "ngan" }), /DASHBOARD_PASSWORD/);
  });
});
