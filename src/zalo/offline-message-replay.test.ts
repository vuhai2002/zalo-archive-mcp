import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ThreadType, type API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { createMissedMessageRequester, MAX_PAGES } from "./offline-message-replay.js";

type Sent = { kind: "first"; type: ThreadType } | { kind: "next"; cmd: number; lastId: string };

function setup() {
  const sent: Sent[] = [];
  const reactionsAsked: ThreadType[] = [];
  const api = {
    listener: {
      requestOldMessages: (type: ThreadType) => sent.push({ kind: "first", type }),
      requestOldReactions: (type: ThreadType) => reactionsAsked.push(type),
      sendWs: (p: { cmd: number; data: { first: boolean; lastId: string } }) => {
        assert.equal(p.data.first, false);
        sent.push({ kind: "next", cmd: p.cmd, lastId: p.data.lastId });
      },
    },
  } as unknown as API;
  let clock = 0;
  const r = createMissedMessageRequester(api, createSilentLogger(), { minIntervalMs: 600_000, now: () => clock, random: () => 0.5 });
  return { r, sent, reactionsAsked, advanceClock: (ms: number) => void (clock += ms) };
}

describe("xin bù tin lỡ", () => {
  it("mỗi lần kết nối một lượt: tin 1-1 ngay, tin nhóm sau vài giây; nối lại liền thì không xin lại", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { r, sent, reactionsAsked, advanceClock } = setup();
      r.onConnected();
      assert.deepEqual(sent, [{ kind: "first", type: ThreadType.User }]);
      mock.timers.tick(3_500);
      assert.deepEqual(sent.at(-1), { kind: "first", type: ThreadType.Group });
      assert.deepEqual(reactionsAsked, [], "cảm xúc lỡ xin sau phần tin");
      mock.timers.tick(10_000);
      assert.deepEqual(reactionsAsked, [ThreadType.User, ThreadType.Group]);

      advanceClock(120_000);
      r.onConnected();
      mock.timers.tick(10_000);
      assert.equal(sent.length, 2, "nối lại sau 2 phút thì bỏ qua");
    } finally {
      mock.timers.reset();
    }
  });

  it("phản hồi báo còn trang: xin trang sau bằng lastActionId, có nhịp, tối đa 5 trang", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { r, sent } = setup();
      r.onConnected();
      for (let page = 1; page <= MAX_PAGES + 2; page++) {
        r.onPage({ threadType: ThreadType.User, count: 50, meta: { more: 1, lastActionId: `a${page}` } });
        mock.timers.tick(1_999);
        const nextAsked = sent.filter((s) => s.kind === "next").length;
        assert.equal(nextAsked, Math.min(page - 1, MAX_PAGES - 1), "chưa tới nhịp thì chưa xin");
        mock.timers.tick(1_500);
      }
      const next = sent.filter((s): s is Extract<Sent, { kind: "next" }> => s.kind === "next");
      assert.deepEqual(next.map((s) => [s.cmd, s.lastId]), [[510, "a1"], [510, "a2"], [510, "a3"], [510, "a4"]]);
    } finally {
      mock.timers.reset();
    }
  });

  it("hết trang, thiếu mã trang (tên trường lạ), hay trang không về: dừng, không xin thêm", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { r, sent } = setup();
      r.onConnected();
      r.onPage({ threadType: ThreadType.User, count: 12, meta: { more: 0, lastActionId: "x" } });
      mock.timers.tick(3_500); // tới lượt tin nhóm
      r.onPage({ threadType: ThreadType.Group, count: 4, meta: { coThem: true } });
      mock.timers.tick(30_000);
      assert.deepEqual(sent.filter((s) => s.kind === "next"), []);

      const s2 = setup();
      s2.r.onConnected();
      s2.r.onPage({ threadType: ThreadType.User, count: 50, meta: { more: true, lastActionId: 7 } });
      mock.timers.tick(4_000);
      assert.equal(s2.sent.filter((s) => s.kind === "next").length, 1);
      mock.timers.tick(9_000); // trang 2 không về trong 8 giây
      s2.r.onPage({ threadType: ThreadType.User, count: 50, meta: { more: true, lastActionId: 8 } });
      mock.timers.tick(10_000);
      assert.equal(s2.sent.filter((s) => s.kind === "next").length, 1, "trang về trễ sau khi đã bỏ cuộc thì không xin tiếp");
    } finally {
      mock.timers.reset();
    }
  });
});
