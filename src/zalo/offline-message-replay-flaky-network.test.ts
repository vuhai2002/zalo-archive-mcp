import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it, mock } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { readReplayCursors, saveReplayCursors } from "../storage/offline-replay-cursor-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createMissedMessageRequester } from "./offline-message-replay.js";
import { CURSOR_STRIKES_TO_DROP, PAGE_TIMEOUT_MS, RETRY_DELAYS_MS } from "./offline-replay-pacing.js";

// Mở máy chỗ chưa có wifi, wifi chập chờn, máy vừa thức Zalo trả chậm: không được làm mất mốc lấy bù

type Sent = { cmd: number; first: boolean; lastId: string | null };
const ALL_RETRIES_MS = PAGE_TIMEOUT_MS * (RETRY_DELAYS_MS.length + 1) + RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1_000;

/** Đi tới từng giây: mock timers không chạy hẹn giờ đặt ra ngay trong một lần tick (hỏi lại là hẹn giờ lồng nhau) */
const tickSlowly = (ms: number) => {
  for (let t = 0; t < ms; t += 1_000) mock.timers.tick(1_000);
};
const page = (lastActionId: string, more: boolean, count = 50) => ({ count, meta: { more, lastActionId } });

function setup(db: DatabaseSync) {
  const sent: Sent[] = [];
  const api = {
    listener: {
      sendWs: (p: { cmd: number; data: { first: boolean; lastId: string | null } }) => void sent.push({ cmd: p.cmd, first: p.data.first, lastId: p.data.lastId }),
    },
  } as unknown as API;
  let clock = 0;
  const r = createMissedMessageRequester(api, db, createSilentLogger(), { minIntervalMs: 600_000, now: () => clock, random: () => 0.5 });
  return { r, sent, advanceClock: (ms: number) => void (clock += ms) };
}

function withTimers(fn: () => void) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

const withCursor = () => {
  const db = openArchiveDatabase(":memory:");
  saveReplayCursors(db, { user_messages: "8400006000112" });
  return db;
};
const asks510 = (sent: Sent[]) => sent.filter((s) => s.cmd === 510);

describe("lấy bù khi mạng yếu", () => {
  it("máy vừa thức, Zalo trả chậm: hỏi lại cùng mốc, giãn dần; trả lời về trễ thì nhận và đi tiếp", () =>
    withTimers(() => {
      const db = withCursor();
      const { r, sent } = setup(db);
      r.onConnected();
      tickSlowly(PAGE_TIMEOUT_MS + RETRY_DELAYS_MS[0]! + 1_000);
      assert.deepEqual(asks510(sent).map((s) => [s.first, s.lastId]), [[true, "8400006000112"], [true, "8400006000112"]], "hỏi lại đúng mốc cũ");

      r.onPage("user_messages", page("8400006000200", true)); // trả lời của lần hỏi đầu, về trễ
      r.onPage("user_messages", page("8400006000200", true)); // trả lời của lần hỏi lại: trùng, bỏ qua
      mock.timers.tick(4_000);
      assert.deepEqual(asks510(sent).slice(2).map((s) => [s.first, s.lastId]), [[false, "8400006000200"]], "chỉ xin trang kế một lần");
      r.onPage("user_messages", page("8400006000300", false, 3));
      assert.equal(readReplayCursors(db).user_messages, "8400006000300");
    }));

  it("chưa có mạng / mạng chết hẳn: hết lần hỏi lại thì dừng nhưng GIỮ mốc; nối lại là xin tiếp từ mốc", () =>
    withTimers(() => {
      const db = withCursor();
      const { r, sent, advanceClock } = setup(db);
      r.onConnected();
      tickSlowly(ALL_RETRIES_MS);
      assert.equal(asks510(sent).length, RETRY_DELAYS_MS.length + 1);
      assert.equal(readReplayCursors(db).user_messages, "8400006000112", "không bỏ mốc khi chưa hàng chờ nào được trả");

      r.onDisconnected();
      advanceClock(60_000);
      r.onConnected();
      assert.deepEqual(asks510(sent).at(-1), { cmd: 510, first: true, lastId: "8400006000112" });
    }));

  it("wifi chập chờn: rớt kết nối giữa lúc chờ hỏi lại thì thôi hỏi, nối lại xin ngay từ mốc", () =>
    withTimers(() => {
      const db = withCursor();
      const { r, sent } = setup(db);
      r.onConnected();
      mock.timers.tick(PAGE_TIMEOUT_MS + 1);
      r.onDisconnected();
      tickSlowly(ALL_RETRIES_MS);
      assert.equal(asks510(sent).length, 1, "không gửi lên kết nối đã đóng");
      r.onConnected();
      assert.deepEqual(asks510(sent).at(-1)?.lastId, "8400006000112");
      assert.equal(readReplayCursors(db).user_messages, "8400006000112");
    }));

  it("chỉ bỏ mốc khi Zalo trả các hàng chờ khác mà riêng hàng chờ này hỏi từ mốc không bao giờ trả, nhiều lần kết nối", () =>
    withTimers(() => {
      const db = withCursor();
      const { r, sent } = setup(db);
      for (let n = 1; n <= CURSOR_STRIKES_TO_DROP; n++) {
        r.onConnected();
        mock.timers.tick(3_500);
        r.onPage("group_messages", page("8400008000001", false, 2)); // mạng tốt: Zalo trả tin nhóm
        tickSlowly(ALL_RETRIES_MS);
        const still = readReplayCursors(db).user_messages;
        if (n < CURSOR_STRIKES_TO_DROP) assert.equal(still, "8400006000112", `lần ${n}: còn giữ mốc`);
        r.onDisconnected();
      }
      assert.equal(readReplayCursors(db).user_messages, undefined, "đủ số lần thì bỏ mốc");
      r.onConnected();
      assert.deepEqual(asks510(sent).at(-1)?.lastId, null, "lần sau xin từ đầu hàng chờ");
    }));
});
