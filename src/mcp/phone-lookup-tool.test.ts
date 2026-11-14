import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getPhoneLookups, markLookupFound, markLookupNoZalo, queuePhoneLookups, setLookupPause } from "../storage/phone-lookup-store.js";
import { setKillSwitch } from "../storage/send-control-store.js";
import { updateSendSettings } from "../storage/send-settings-store.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { lookupPhonesTool } from "./phone-lookup-tool.js";

const env = parseEnv({});
const NOW = new Date("2026-03-10T03:00:00.000Z");
const P1 = "84900000001";
const P2 = "84900000002";

function setup(readOnly = false) {
  const db = openArchiveDatabase(":memory:");
  return { db, ctx: { db, env, readOnly, now: () => NOW } };
}
const textOf = (r: ReturnType<typeof lookupPhonesTool>) => (r.ok ? r.text : `LỖI: ${r.error}`);

describe("lookup_phones", () => {
  it("xếp số mới, gộp trùng theo số chuẩn hóa, báo không hợp lệ", () => {
    const { db, ctx } = setup();
    const out = textOf(lookupPhonesTool(ctx, { phones: ["0900000001", "+84900000001", "abc"] }));
    assert.deepEqual(getPhoneLookups(db, [P1]).map((r) => r.status), ["pending"]);
    assert.match(out, /đang chờ tra 1/);
    assert.match(out, /không hợp lệ 1/);
    assert.match(out, /abc/);
    assert.equal(out.match(/0900000001 ->/g)?.length, 1);
  });

  it("trả found kèm thread_id trong khối bọc dữ liệu", () => {
    const { db, ctx } = setup();
    queuePhoneLookups(db, [P1], NOW.toISOString());
    markLookupFound(db, P1, { uid: "u-lan", name: "Lan", avatarUrl: null }, NOW.toISOString());
    const out = textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] }));
    assert.match(out, /có Zalo 1/);
    assert.match(out, /0900000001 -> có Zalo: Lan \| thread_id=u-lan/);
    assert.match(out, /<zalo_data_[0-9a-f]{8} /);
  });

  it("không có Zalo kèm mã của Zalo", () => {
    const { db, ctx } = setup();
    queuePhoneLookups(db, [P1], NOW.toISOString());
    markLookupNoZalo(db, P1, 216, "User không hợp lệ", NOW.toISOString());
    assert.match(textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] })), /0900000001 -> không có Zalo \(216/);
  });

  it("recheck đưa no_zalo về pending; cancel bỏ pending", () => {
    const { db, ctx } = setup();
    queuePhoneLookups(db, [P1, P2], NOW.toISOString());
    markLookupNoZalo(db, P1, 216, "User không hợp lệ", NOW.toISOString());
    assert.match(textOf(lookupPhonesTool(ctx, { phones: ["0900000001"], recheck: true })), /xếp lại 1/);
    assert.deepEqual(getPhoneLookups(db, [P1]).map((r) => r.status), ["pending"]);
    assert.match(textOf(lookupPhonesTool(ctx, { phones: ["0900000001", "0900000002"], cancel: true })), /bỏ 2/);
    assert.deepEqual(getPhoneLookups(db, [P1, P2]), []);
  });

  it("recheck và cancel cùng lúc là lỗi", () => {
    const { ctx } = setup();
    assert.equal(lookupPhonesTool(ctx, { phones: ["0900000001"], recheck: true, cancel: true }).ok, false);
  });

  it("nick Chỉ đọc: không xếp số mới nhưng vẫn trả kết quả cũ", () => {
    const { db, ctx } = setup(true);
    queuePhoneLookups(db, [P1], NOW.toISOString());
    markLookupFound(db, P1, { uid: "u-lan", name: "Lan", avatarUrl: null }, NOW.toISOString());
    const out = textOf(lookupPhonesTool(ctx, { phones: ["0900000001", "0900000002"] }));
    assert.match(out, /Chỉ đọc/);
    assert.match(out, /thread_id=u-lan/);
    assert.deepEqual(getPhoneLookups(db, [P2]), []);
  });

  it("báo đang tạm dừng và lý do", () => {
    const { db, ctx } = setup();
    setLookupPause(db, "2026-03-11T00:00:00.000Z", "Zalo trả mã 313: thử");
    assert.match(textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] })), /tạm dừng.*Zalo trả mã 313/s);
  });

  it("còn số chờ mà vòng tra đứng: nói rõ vì sao (khóa khẩn cấp, daemon chưa chạy)", () => {
    const { db, ctx } = setup();
    setKillSwitch(db, true, "khóa giả trong test");
    const out = textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] }));
    assert.match(out, /Khóa khẩn cấp đang bật/);
    assert.match(out, /Daemon chưa sẵn sàng/);
  });

  it("daemon đang chạy, không khóa, trong giờ: không báo đứng", () => {
    const { db, ctx } = setup();
    setMeta(db, "daemon_session_state", "running");
    setMeta(db, "listener_heartbeat_at", NOW.toISOString());
    const out = textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] }));
    assert.doesNotMatch(out, /chưa tra được|Khóa khẩn cấp|Daemon chưa/);
  });

  it("ngoài khung giờ lô và đủ trần hôm nay thì nói rõ", () => {
    const { db, ctx } = setup();
    const late = new Date("2026-03-10T16:00:00.000Z"); // 23:00 giờ VN
    assert.match(textOf(lookupPhonesTool({ ...ctx, now: () => late }, { phones: ["0900000001"] })), /ngoài khung giờ/);
    updateSendSettings(db, env, { lookupDailyCap: 0 });
    assert.match(textOf(lookupPhonesTool(ctx, { phones: ["0900000001"] })), /đủ trần/);
  });

  it("báo cần thêm mấy ngày khi số chờ vượt trần còn lại", () => {
    const { ctx } = setup();
    const phones = Array.from({ length: 250 }, (_, i) => `09000${String(i).padStart(5, "0")}`);
    assert.match(textOf(lookupPhonesTool(ctx, { phones })), /khoảng 3 ngày/);
  });
});
