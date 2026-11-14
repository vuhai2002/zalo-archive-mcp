import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it, mock } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { readReplayCursors, saveReplayCursors } from "../storage/offline-replay-cursor-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createMissedMessageRequester, MAX_PAGES } from "./offline-message-replay.js";

type Sent = { cmd: number; first: boolean; lastId: string | null };
// Hàng chờ điều khiển (sự kiện nhóm) là lệnh con 0, các hàng chờ tin / cảm xúc là lệnh con 1
const SUB_CMD: Record<number, number> = { 603: 0 };

function setup(db: DatabaseSync = openArchiveDatabase(":memory:")) {
  const sent: Sent[] = [];
  const api = {
    listener: {
      sendWs: (p: { version: number; cmd: number; subCmd: number; data: { first: boolean; lastId: string | null; preIds: unknown[] } }) => {
        assert.deepEqual([p.version, p.subCmd, p.data.preIds], [1, SUB_CMD[p.cmd] ?? 1, []]);
        sent.push({ cmd: p.cmd, first: p.data.first, lastId: p.data.lastId });
      },
    },
  } as unknown as API;
  let clock = 0;
  const r = createMissedMessageRequester(api, db, createSilentLogger(), { minIntervalMs: 600_000, now: () => clock, random: () => 0.5 });
  return { r, db, sent, advanceClock: (ms: number) => void (clock += ms) };
}

const page = (lastActionId: string | number | undefined, more: boolean | number, count = 50) => ({ count, meta: { more, lastActionId } });

/** Chạy hết các hàng chờ bắt đầu lệch giờ (tin nhóm ~3,5 giây, cảm xúc ~9,5 và ~12,5, sự kiện nhóm ~15,5 giây) */
const startAll = () => mock.timers.tick(18_000);

/** Ngay sau onConnected: từng hàng chờ bắt đầu thì Zalo trả luôn một trang "hết" - cả lượt xong hẳn, không trang nào hết giờ */
function completeRound(r: { onPage: (q: "user_messages" | "group_messages" | "user_reactions" | "group_reactions" | "group_events", p: unknown) => void }) {
  const done = { count: 0, meta: { more: 0, lastActionId: "1" } };
  r.onPage("user_messages", done);
  for (const [ms, q] of [[3_500, "group_messages"], [6_000, "user_reactions"], [3_000, "group_reactions"], [3_000, "group_events"]] as const) {
    mock.timers.tick(ms);
    r.onPage(q, done);
  }
}

function withTimers(fn: () => void) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

describe("xin bù tin + cảm xúc lỡ", () => {
  it("mỗi lần kết nối một lượt cho cả năm hàng chờ, lệch giờ nhau; nối lại liền thì không xin lại", () =>
    withTimers(() => {
      const { r, sent } = setup();
      r.onConnected();
      assert.deepEqual(sent, [{ cmd: 510, first: true, lastId: null }], "tin 1-1 ngay");
      mock.timers.tick(3_500);
      assert.deepEqual(sent.at(-1), { cmd: 511, first: true, lastId: null });
      startAll();
      assert.deepEqual(sent.map((s) => s.cmd), [510, 511, 610, 611, 603], "cảm xúc, sự kiện nhóm xin sau phần tin");

      // Lượt xong hẳn (Zalo báo hết trang) thì nối lại liền bỏ qua; lượt dừng dở thì lần nối sau xin lại ngay (test riêng)
      const s2 = setup();
      s2.r.onConnected();
      completeRound(s2.r);
      s2.advanceClock(120_000);
      s2.r.onConnected();
      startAll();
      assert.equal(s2.sent.length, 5, "nối lại sau 2 phút thì bỏ qua");
    }));

  it("còn trang thì xin tiếp bằng lastActionId, có nhịp; mỗi trang lưu mốc; tối đa MAX_PAGES trang", () =>
    withTimers(() => {
      const { r, db, sent } = setup();
      r.onConnected();
      for (let n = 1; n <= MAX_PAGES + 2; n++) {
        r.onPage("user_messages", page(`${100 + n}`, 1));
        mock.timers.tick(1_999);
        assert.equal(sent.filter((s) => s.cmd === 510 && !s.first).length, Math.min(n - 1, MAX_PAGES - 1), "chưa tới nhịp thì chưa xin");
        mock.timers.tick(1_500);
      }
      const next = sent.filter((s) => s.cmd === 510 && !s.first);
      assert.equal(next.length, MAX_PAGES - 1);
      assert.deepEqual(next.slice(0, 2).map((s) => s.lastId), ["101", "102"]);
      assert.equal(readReplayCursors(db).user_messages, `${100 + MAX_PAGES}`, "chạm trần vẫn giữ mốc trang cuối đã nhận");
    }));

  it("cảm xúc cũng lật trang (cmd 610/611), không lẫn với hàng chờ tin", () =>
    withTimers(() => {
      const { r, db, sent } = setup();
      r.onConnected();
      startAll();
      r.onPage("group_reactions", page("8400005000111", 1));
      mock.timers.tick(4_000);
      assert.deepEqual(sent.at(-1), { cmd: 611, first: false, lastId: "8400005000111" });
      r.onPage("group_reactions", page("8400009000114", 0, 7));
      mock.timers.tick(10_000);
      assert.equal(sent.filter((s) => s.cmd === 611).length, 2, "hết trang thì thôi");
      assert.deepEqual(readReplayCursors(db), { group_reactions: "8400009000114" });
    }));

  it("lần chạy sau (khởi động lại daemon) xin từ mốc đã lưu, không từ đầu hàng chờ", () =>
    withTimers(() => {
      const db = openArchiveDatabase(":memory:");
      saveReplayCursors(db, { user_messages: "8400006000112", group_reactions: "8400009000114" });
      const { r, sent } = setup(db);
      r.onConnected();
      startAll();
      assert.deepEqual(sent, [
        { cmd: 510, first: true, lastId: "8400006000112" },
        { cmd: 511, first: true, lastId: null },
        { cmd: 610, first: true, lastId: null },
        { cmd: 611, first: true, lastId: "8400009000114" },
        { cmd: 603, first: true, lastId: null },
      ]);
    }));

  it("lấy bù xong thì tin / cảm xúc nhận trực tiếp đẩy mốc lên (chỉ tiến); chưa xong hay lần nối lại bị bỏ qua thì không", () =>
    withTimers(() => {
      const { r, db, advanceClock } = setup();
      r.onConnected();
      r.onLiveEvent("user_messages", "9000000000001");
      assert.equal(readReplayCursors(db).user_messages, undefined, "đang lấy bù: tin trực tiếp chưa được đẩy mốc");
      r.onPage("user_messages", page("8400004000000", 0));
      r.onLiveEvent("user_messages", "8400004000005");
      r.onLiveEvent("user_messages", "8400001000000");
      r.onLiveEvent("user_messages", "abc");
      r.onLiveEvent("group_messages", "8400004000009");
      assert.deepEqual(readReplayCursors(db), { user_messages: "8400004000005" }, "chỉ hàng chờ đã xong, chỉ tiến");

      advanceClock(60_000);
      r.onConnected(); // nối lại sau 1 phút: bỏ qua lấy bù, nên không được đẩy mốc nữa
      r.onLiveEvent("user_messages", "8400004000099");
      assert.equal(readReplayCursors(db).user_messages, "8400004000005");
    }));

  it("hết trang, thiếu mã trang, hay trang không về: dừng; trang về trễ thì bỏ qua", () =>
    withTimers(() => {
      const { r, sent } = setup();
      r.onConnected();
      r.onPage("user_messages", page("x", 0, 12));
      mock.timers.tick(3_500);
      r.onPage("group_messages", { count: 4, meta: { coThem: true } });
      mock.timers.tick(30_000);
      assert.deepEqual(sent.filter((s) => !s.first), []);

      const s2 = setup();
      s2.r.onConnected();
      s2.r.onPage("user_messages", page(7, true));
      mock.timers.tick(4_000);
      assert.equal(s2.sent.filter((s) => !s.first).length, 1);
      mock.timers.tick(9_000); // trang 2 không về trong 8 giây
      s2.r.onPage("user_messages", page(8, true));
      mock.timers.tick(10_000);
      assert.equal(s2.sent.filter((s) => !s.first).length, 1, "trang về trễ sau khi đã bỏ cuộc thì không xin tiếp");
    }));

  it("sự kiện nhóm (cmd 603 lệnh con 0) lật trang, lưu mốc riêng; Zalo báo hàng chờ đầy thì vẫn đi tiếp", () =>
    withTimers(() => {
      const { r, db, sent } = setup();
      r.onConnected();
      startAll();
      r.onPage("group_events", { count: 32, meta: { more: 1, lastActionId: "8400012772351", queueStatus: { "603_0": { evict: 1 } } } });
      mock.timers.tick(4_000);
      assert.deepEqual(sent.at(-1), { cmd: 603, first: false, lastId: "8400012772351" });
      r.onPage("group_events", page("8400012772399", 0, 3));
      assert.deepEqual(readReplayCursors(db), { group_events: "8400012772399" });
    }));

  it("kết nối đóng giữa lúc xin (vd Zalo đóng ngay sau khi nối): giữ mốc, nối lại là xin lại ngay từ mốc", () =>
    withTimers(() => {
      const db = openArchiveDatabase(":memory:");
      saveReplayCursors(db, { user_messages: "8400006000112", group_events: "1775300000000" });
      const { r, sent, advanceClock } = setup(db);
      r.onConnected();
      r.onDisconnected();
      mock.timers.tick(60_000);
      assert.deepEqual(sent.map((s) => s.cmd), [510], "các hàng chờ chưa bắt đầu thì thôi, không gửi lên kết nối đã đóng");
      assert.deepEqual(readReplayCursors(db), { user_messages: "8400006000112", group_events: "1775300000000" }, "không bỏ mốc");

      advanceClock(60_000); // nối lại sau 1 phút - vẫn trong minIntervalMs nhưng lượt trước chưa xong
      r.onConnected();
      startAll();
      assert.deepEqual(sent.slice(1).map((s) => [s.cmd, s.lastId]), [
        [510, "8400006000112"],
        [511, null],
        [610, null],
        [611, null],
        [603, "1775300000000"],
      ]);
    }));

  it("xin từ mốc mà Zalo không trả lời: bỏ mốc đó, lần sau xin từ đầu như trước", () =>
    withTimers(() => {
      const db = openArchiveDatabase(":memory:");
      saveReplayCursors(db, { user_messages: "8400006000112", group_messages: "8400008000113" });
      const { r } = setup(db);
      r.onConnected();
      mock.timers.tick(3_500);
      r.onPage("group_messages", page("8400008799999", 0, 3));
      mock.timers.tick(9_000);
      assert.deepEqual(readReplayCursors(db), { group_messages: "8400008799999" });
    }));
});

describe("ghi kết quả mỗi lượt lấy bù (để báo khoảng không nghe đã lấy bù đủ chưa)", () => {
  const runs = (db: DatabaseSync) =>
    db.prepare("SELECT queue, pages, items, outcome, detail FROM backfill_runs ORDER BY id").all().map((r) => ({ ...r })) as Array<{
      queue: string;
      pages: number;
      items: number;
      outcome: string;
      detail: string | null;
    }>;

  it("Zalo báo hết trang: lượt đó xong, đếm số tin qua các trang", () =>
    withTimers(() => {
      const { r, db } = setup();
      r.onConnected();
      r.onPage("user_messages", page("101", 1, 50));
      mock.timers.tick(4_000);
      r.onPage("user_messages", page("102", 0, 7));
      assert.deepEqual(runs(db), [{ queue: "user_messages", pages: 2, items: 57, outcome: "complete", detail: null }]);
    }));

  it("Zalo báo đã bỏ bớt phần cũ: lượt đó không đủ", () =>
    withTimers(() => {
      const { r, db } = setup();
      r.onConnected();
      r.onPage("user_messages", { count: 3, meta: { more: 0, lastActionId: "101", queueStatus: { "510_1": { evict: 1 } } } });
      assert.equal(runs(db)[0]?.outcome, "incomplete");
      assert.match(runs(db)[0]?.detail ?? "", /bỏ bớt/);
    }));

  it("chạm trần trang: không đủ", () =>
    withTimers(() => {
      const { r, db } = setup();
      r.onConnected();
      for (let n = 1; n <= MAX_PAGES; n++) {
        r.onPage("user_messages", page(`${100 + n}`, 1));
        mock.timers.tick(4_000);
      }
      assert.equal(runs(db).find((x) => x.queue === "user_messages")?.outcome, "incomplete");
      assert.match(runs(db).find((x) => x.queue === "user_messages")?.detail ?? "", /trần trang/);
    }));

  it("trang không về: không đủ", () =>
    withTimers(() => {
      const { r, db } = setup();
      r.onConnected();
      r.onPage("user_messages", page("101", 1));
      mock.timers.tick(4_000);
      mock.timers.tick(9_000);
      assert.equal(runs(db).find((x) => x.queue === "user_messages")?.outcome, "incomplete");
    }));

  it("mất kết nối giữa lúc lấy bù: lượt đang dở không đủ", () =>
    withTimers(() => {
      const { r, db } = setup();
      r.onConnected();
      r.onDisconnected();
      assert.deepEqual(
        runs(db).map((x) => [x.queue, x.outcome]),
        [["user_messages", "incomplete"]],
      );
      assert.match(runs(db)[0]?.detail ?? "", /mất kết nối/i);
    }));
});

describe("xin bù ngay khi máy vừa thức mà kết nối không đứt", () => {
  it("requestNow xin bù ngay cả khi vừa xin gần đây (không chờ khoảng tối thiểu)", () =>
    withTimers(() => {
      const { r, sent, advanceClock } = setup();
      r.onConnected();
      completeRound(r);
      advanceClock(60_000);
      assert.equal(r.requestNow(), true);
      startAll();
      assert.deepEqual(sent.slice(5).map((s) => s.cmd), [510, 511, 610, 611, 603]);
    }));

  it("đang có lượt dở thì requestNow không xin chồng", () =>
    withTimers(() => {
      const { r, sent } = setup();
      r.onConnected();
      assert.equal(r.requestNow(), false);
      assert.equal(sent.length, 1);
    }));

  it("lượt trước dừng dở (trang không về) thì lần kết nối sau xin lại ngay, không chờ khoảng tối thiểu", () =>
    withTimers(() => {
      const { r, sent, advanceClock } = setup();
      r.onConnected();
      r.onPage("user_messages", page("101", 1));
      mock.timers.tick(4_000);
      mock.timers.tick(9_000); // trang 2 không về: lượt tin 1-1 dừng dở
      startAll();
      const before = sent.length;
      advanceClock(120_000);
      r.onConnected();
      assert.ok(sent.length > before, "nối lại sau 2 phút vẫn xin bù vì lượt trước chưa đủ");
    }));
});
