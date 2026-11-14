import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { localHourTomorrowUtc } from "../shared/local-date-range.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getLookupPause, getPhoneLookups, markLookupAttempt, queuePhoneLookups, requeuePhoneLookups } from "../storage/phone-lookup-store.js";
import { getKillSwitch, setKillSwitch } from "../storage/send-control-store.js";
import { updateSendSettings } from "../storage/send-settings-store.js";
import type { PhoneLookupOutcome } from "../zalo/zca-phone-lookup-api.js";
import { PhoneLookupWorker } from "./phone-lookup-loop.js";

const env = parseEnv({});
const TZ = env.ARCHIVE_TIMEZONE;
// 10:00 giờ VN
const AT_10AM = new Date("2026-03-10T03:00:00.000Z");
const MINUTE = 60_000;
const P1 = "84900000001";
const found = (uid: string): PhoneLookupOutcome => ({ kind: "found", user: { uid, name: "Lan", avatarUrl: null } });
const NO_ZALO: PhoneLookupOutcome = { kind: "zalo_error", code: 216, message: "User không hợp lệ" };
/** 10 số giả liền nhau 84900000010..19 */
const TEN = Array.from({ length: 10 }, (_, i) => `849000000${10 + i}`);

/** `script(phone, lần gọi thứ mấy cho số đó)` quyết định Zalo trả gì; Error = lỗi mạng */
function setup(script: (phone: string, nth: number) => PhoneLookupOutcome | Error = () => NO_ZALO) {
  const db = openArchiveDatabase(":memory:");
  const calls: string[] = [];
  const state = { clock: AT_10AM, readOnly: false, connected: true };
  const worker = new PhoneLookupWorker({
    db,
    env,
    log: createSilentLogger(),
    lookup: async (phone) => {
      calls.push(phone);
      const r = script(phone, calls.filter((p) => p === phone).length);
      if (r instanceof Error) throw r;
      return r;
    },
    isReadOnly: () => state.readOnly,
    isListenerConnected: () => state.connected,
    now: () => state.clock,
    random: () => 0,
  });
  /** Một lượt rồi tua đồng hồ 1 phút (dư nhịp 5-20 giây) */
  const step = async () => {
    const wait = await worker.tick();
    state.clock = new Date(state.clock.getTime() + MINUTE);
    return wait;
  };
  return { db, worker, calls, state, step };
}

const statusOf = (db: ReturnType<typeof setup>["db"], phones: string[]) => getPhoneLookups(db, phones).map((r) => r.status);

describe("PhoneLookupWorker", () => {
  it("tra số pending, tìm thấy thì ghi found", async () => {
    const t = setup(() => found("u-lan"));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    assert.deepEqual(t.calls, [P1]);
    const row = getPhoneLookups(t.db, [P1])[0];
    assert.deepEqual([row?.status, row?.userId], ["found", "u-lan"]);
  });

  it("216 thành no_zalo, không bật kill switch", async () => {
    const t = setup();
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    assert.deepEqual(statusOf(t.db, [P1]), ["no_zalo"]);
    assert.equal(getKillSwitch(t.db).killed, false);
  });

  it("mã lạ 313: giữ pending, tạm dừng tới khung giờ ngày mai", async () => {
    const t = setup(() => ({ kind: "zalo_error", code: 313, message: "Tìm quá nhiều lần" }));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    assert.deepEqual(statusOf(t.db, [P1]), ["pending"]);
    assert.equal(getLookupPause(t.db)?.until, localHourTomorrowUtc(TZ, 7, AT_10AM));
    assert.match(getLookupPause(t.db)?.reason ?? "", /313/);
    await t.step();
    assert.equal(t.calls.length, 1);
    assert.equal(getKillSwitch(t.db).killed, false);
  });

  it("đủ trần ngày thì không gọi Zalo; qua ngày mới tra tiếp", async () => {
    const t = setup();
    updateSendSettings(t.db, env, { lookupDailyCap: 2 });
    queuePhoneLookups(t.db, TEN.slice(0, 3), AT_10AM.toISOString());
    for (let i = 0; i < 4; i++) await t.step();
    assert.equal(t.calls.length, 2);
    t.state.clock = new Date(AT_10AM.getTime() + 24 * 60 * MINUTE);
    await t.step();
    assert.equal(t.calls.length, 3);
  });

  it("tra lại (recheck) trong ngày vẫn tính vào trần", async () => {
    const t = setup();
    updateSendSettings(t.db, env, { lookupDailyCap: 2 });
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    requeuePhoneLookups(t.db, [P1], t.state.clock.toISOString());
    await t.step();
    requeuePhoneLookups(t.db, [P1], t.state.clock.toISOString());
    await t.step();
    assert.equal(t.calls.length, 2);
  });

  it("qua nửa đêm theo giờ VN (cùng ngày UTC) là ngày mới, trần tính lại", async () => {
    const t = setup();
    updateSendSettings(t.db, env, { lookupDailyCap: 1, batchWindowStartHour: 0, batchWindowEndHour: 24 });
    t.state.clock = new Date("2026-03-10T16:30:00.000Z"); // 23:30 ngày 10/3 giờ VN
    queuePhoneLookups(t.db, TEN.slice(0, 2), t.state.clock.toISOString());
    await t.step();
    t.state.clock = new Date("2026-03-10T17:30:00.000Z"); // 00:30 ngày 11/3 giờ VN, vẫn ngày 10/3 UTC
    await t.step();
    assert.equal(t.calls.length, 2);
  });

  it("ngoài khung giờ lô thì không gọi Zalo", async () => {
    const t = setup();
    t.state.clock = new Date("2026-03-10T16:00:00.000Z"); // 23:00 giờ VN
    queuePhoneLookups(t.db, [P1], t.state.clock.toISOString());
    await t.step();
    assert.equal(t.calls.length, 0);
  });

  it("kill switch / Chỉ đọc / listener rớt: không gọi Zalo", async () => {
    const t = setup();
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    setKillSwitch(t.db, true, "thử");
    await t.step();
    setKillSwitch(t.db, false, null);
    t.state.readOnly = true;
    await t.step();
    t.state.readOnly = false;
    t.state.connected = false;
    await t.step();
    assert.equal(t.calls.length, 0);
    t.state.connected = true;
    await t.step();
    assert.equal(t.calls.length, 1);
  });

  it("10 no_zalo liền + số mốc cũng không ra: chuỗi về pending, tạm dừng", async () => {
    // Số mốc ra người ở lần đầu, lần tra lại thì không ra (như Zalo đang chặn)
    const t = setup((phone, nth) => (phone === P1 && nth === 1 ? found("u-lan") : NO_ZALO));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    queuePhoneLookups(t.db, TEN, t.state.clock.toISOString());
    for (let i = 0; i < 10; i++) await t.step();
    // Số mốc tra ở lượt riêng, theo nhịp như mọi lượt - không gọi liền ngay sau số thứ 10
    assert.equal(t.calls.length, 11);
    await t.step();
    assert.deepEqual(t.calls, [P1, ...TEN, P1]);
    assert.deepEqual(statusOf(t.db, TEN), Array(10).fill("pending"));
    assert.match(getLookupPause(t.db)?.reason ?? "", /chặn tra số/);
  });

  it("10 no_zalo liền + số mốc vẫn ra: tra tiếp, không dừng", async () => {
    const t = setup((phone) => (phone === P1 ? found("u-lan") : NO_ZALO));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    await t.step();
    queuePhoneLookups(t.db, [...TEN, "84900000099"], t.state.clock.toISOString());
    for (let i = 0; i < 12; i++) await t.step();
    assert.deepEqual(t.calls, [P1, ...TEN, P1, "84900000099"]);
    assert.deepEqual(statusOf(t.db, TEN), Array(10).fill("no_zalo"));
    assert.equal(getLookupPause(t.db), null);
  });

  it("số mốc mới nhất tự ẩn tìm kiếm nhưng số mốc cũ hơn vẫn ra: không dừng, tra tiếp", async () => {
    const PA = "84900000021";
    const PB = "84900000022";
    const t = setup((phone, nth) => (phone === PA ? found("u-lan") : phone === PB && nth === 1 ? found("u-binh") : NO_ZALO));
    queuePhoneLookups(t.db, [PA], AT_10AM.toISOString());
    await t.step();
    queuePhoneLookups(t.db, [PB], t.state.clock.toISOString());
    await t.step();
    queuePhoneLookups(t.db, [...TEN, "84900000099"], t.state.clock.toISOString());
    for (let i = 0; i < 13; i++) await t.step();
    assert.deepEqual(t.calls, [PA, PB, ...TEN, PB, PA, "84900000099"]);
    assert.equal(getLookupPause(t.db), null);
    assert.deepEqual(statusOf(t.db, [PA, PB]), ["found", "no_zalo"]);
    assert.deepEqual(statusOf(t.db, TEN), Array(10).fill("no_zalo"));
  });

  it("mã lạ: số đó ghi mã, xuống cuối hàng; hôm sau tra số khác trước", async () => {
    const P2 = "84900000002";
    const t = setup((phone) => (phone === P1 ? { kind: "zalo_error", code: 313, message: "Tìm quá nhiều lần" } : found("u-lan")));
    queuePhoneLookups(t.db, [P1, P2], "2026-03-10T02:59:00.000Z");
    await t.step();
    const row = getPhoneLookups(t.db, [P1])[0];
    assert.deepEqual([row?.status, row?.resultCode, row?.resultMessage], ["pending", 313, "Tìm quá nhiều lần"]);
    assert.match(getLookupPause(t.db)?.reason ?? "", /0900000001/);
    t.state.clock = new Date(AT_10AM.getTime() + 24 * 60 * MINUTE);
    await t.step();
    assert.deepEqual(t.calls, [P1, P2]);
  });

  it("mã lạ lần thứ 3 với cùng một số: số đó thành failed", async () => {
    const t = setup(() => ({ kind: "zalo_error", code: 313, message: "Tìm quá nhiều lần" }));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    markLookupAttempt(t.db, P1, "2026-03-08T03:00:00.000Z");
    markLookupAttempt(t.db, P1, "2026-03-09T03:00:00.000Z");
    await t.step();
    assert.deepEqual(statusOf(t.db, [P1]), ["failed"]);
  });

  it("lỗi mạng: lần 3 thành failed", async () => {
    const t = setup(() => new TypeError("fetch failed"));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    // Daemon tắt giữa lúc tra hai lần trước
    markLookupAttempt(t.db, P1, AT_10AM.toISOString());
    markLookupAttempt(t.db, P1, AT_10AM.toISOString());
    t.state.clock = new Date(AT_10AM.getTime() + MINUTE);
    await t.step();
    assert.deepEqual(statusOf(t.db, [P1]), ["failed"]);
  });

  it("lỗi mạng lần đầu: giữ pending, chờ một phút", async () => {
    const t = setup(() => new TypeError("fetch failed"));
    queuePhoneLookups(t.db, [P1], AT_10AM.toISOString());
    assert.equal(await t.step(), MINUTE);
    assert.deepEqual(statusOf(t.db, [P1]), ["pending"]);
  });
});
