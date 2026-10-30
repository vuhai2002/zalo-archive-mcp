import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it, mock } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { readReplayCursors, saveReplayCursors } from "../storage/offline-replay-cursor-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createMissedMessageRequester, MAX_PAGES } from "./offline-message-replay.js";

type Sent = { cmd: number; first: boolean; lastId: string | null };

function setup(db: DatabaseSync = openArchiveDatabase(":memory:")) {
  const sent: Sent[] = [];
  const api = {
    listener: {
      sendWs: (p: { version: number; cmd: number; subCmd: number; data: { first: boolean; lastId: string | null; preIds: unknown[] } }) => {
        assert.deepEqual([p.version, p.subCmd, p.data.preIds], [1, 1, []]);
        sent.push({ cmd: p.cmd, first: p.data.first, lastId: p.data.lastId });
      },
    },
  } as unknown as API;
  let clock = 0;
  const r = createMissedMessageRequester(api, db, createSilentLogger(), { minIntervalMs: 600_000, now: () => clock, random: () => 0.5 });
  return { r, db, sent, advanceClock: (ms: number) => void (clock += ms) };
}

const page = (lastActionId: string | number | undefined, more: boolean | number, count = 50) => ({ count, meta: { more, lastActionId } });

/** Chạy hết các hàng chờ bắt đầu lệch giờ (tin nhóm ~3,5 giây, cảm xúc ~9,5 và ~12,5 giây) */
const startAll = () => mock.timers.tick(15_000);

function withTimers(fn: () => void) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

describe("xin bù tin + cảm xúc lỡ", () => {
  it("mỗi lần kết nối một lượt cho cả bốn hàng chờ, lệch giờ nhau; nối lại liền thì không xin lại", () =>
    withTimers(() => {
      const { r, sent, advanceClock } = setup();
      r.onConnected();
      assert.deepEqual(sent, [{ cmd: 510, first: true, lastId: null }], "tin 1-1 ngay");
      mock.timers.tick(3_500);
      assert.deepEqual(sent.at(-1), { cmd: 511, first: true, lastId: null });
      startAll();
      assert.deepEqual(sent.map((s) => s.cmd), [510, 511, 610, 611], "cảm xúc xin sau phần tin");

      advanceClock(120_000);
      r.onConnected();
      startAll();
      assert.equal(sent.length, 4, "nối lại sau 2 phút thì bỏ qua");
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
