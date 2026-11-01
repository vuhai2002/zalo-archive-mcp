import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { ThreadType, type API } from "zca-js";
import { listJournalFiles } from "../archive/raw-event-journal.js";
import { createSilentLogger } from "../shared/logger.js";
import { recentConnectionEvents } from "../storage/connection-event-store.js";
import { readThread } from "../storage/message-read-queries.js";
import { readReplayCursors } from "../storage/offline-replay-cursor-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { startArchiveListener } from "./archive-listener.js";

class FakeListener extends EventEmitter {
  /** WebSocket giả: kho đọc thẳng khung WS cho lệnh zca-js bỏ qua (hàng chờ điều khiển 603) */
  ws = new EventEmitter();
  cipherKey = null;
  starts = 0;
  start() {
    this.starts++;
  }
  stop() {}
  requestOldMessages() {}
  sent: Array<{ cmd: number; lastId: string | null }> = [];
  sendWs(p: { cmd: number; data: { lastId: string | null } }) {
    this.sent.push({ cmd: p.cmd, lastId: p.data.lastId });
  }
}

function setup(giveUpAfterFlaps = 3, offlineReplay: { minIntervalMs: number } | null = null) {
  const db = openArchiveDatabase(":memory:");
  const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-journal-"));
  const listener = new FakeListener();
  let gaveUp = false;
  const handle = startArchiveListener({
    api: { listener } as unknown as API,
    db,
    journalDir,
    log: createSilentLogger(),
    reconnect: { baseDelayMs: 1000, maxDelayMs: 4000, duplicateWaitMs: 60_000, giveUpAfterFlaps },
    offlineReplay,
    onGaveUp: () => {
      gaveUp = true;
    },
  });
  return { db, journalDir, listener, handle, gaveUp: () => gaveUp };
}

const userMessage = (msgId: string, content: unknown, isSelf = false) => ({
  type: ThreadType.User,
  threadId: "u-lan",
  isSelf,
  data: { msgId, cliMsgId: "c", uidFrom: isSelf ? "me" : "u-lan", dName: "Lan", ts: "1761620400000", msgType: "webchat", content },
});

describe("archive listener", () => {
  it("ghi nhật ký thô rồi ghi kho; tin tự gửi cũng vào kho", () => {
    const { db, journalDir, listener } = setup();
    listener.emit("message", userMessage("1", "chào"));
    listener.emit("message", userMessage("2", "chào lại", true));
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.deepEqual(rows.map((r) => [r.msgId, r.isSelf]), [["1", false], ["2", true]]);
    const lines = fs.readFileSync(listJournalFiles(journalDir)[0]!, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).event, "message");
  });

  it("lô old_messages: thu hồi bên trong được áp, một tin hỏng không làm mất cả lô", () => {
    const { db, listener } = setup();
    listener.emit("old_messages", [
      userMessage("10", "tin cũ"),
      { type: ThreadType.User, threadId: "u-lan", isSelf: false, data: { content: "thiếu msgId" } },
      userMessage("11", { globalMsgId: 10, deleteMsg: 1 }),
      userMessage("12", "tin cũ khác"),
    ]);
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.deepEqual(rows.map((r) => [r.msgId, r.source, r.recalledAt !== null]), [
      ["10", "old_messages", true],
      ["12", "old_messages", false],
    ]);
  });

  it("lấy bù: trang tin / cảm xúc về đúng hàng chờ và lưu mốc; xong rồi thì tin trực tiếp đẩy mốc lên", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { db, listener, handle } = setup(3, { minIntervalMs: 600_000 });
    try {
      listener.emit("connected");
      listener.emit("old_messages_meta", { threadType: ThreadType.User, count: 3, meta: { more: 0, lastActionId: "8400006000112" } });
      // Các hàng chờ bắt đầu lệch nhau ngẫu nhiên; sự kiện nhóm (603) muộn nhất, trong khoảng 14-17 giây
      mock.timers.tick(18_000);
      assert.deepEqual(listener.sent.map((s) => s.cmd), [510, 511, 610, 611, 603]);
      listener.emit("old_reactions_meta", { threadType: ThreadType.Group, count: 1, meta: { more: 0, lastActionId: "8400009000114" } });
      listener.emit("message", userMessage("8400007000000", "tin mới"));
      listener.emit("reaction", { isGroup: true, threadId: "g-1", data: { msgId: "8400010000000" } });
      assert.deepEqual(readReplayCursors(db), { user_messages: "8400007000000", group_reactions: "8400010000000" });
    } finally {
      handle.stop();
      mock.timers.reset();
    }
  });

  it("sự kiện nhóm lỡ lúc tắt máy (hàng chờ 603): thành thông báo giữa khung chat, cập nhật thành viên, lưu mốc", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { db, listener, handle } = setup(3, { minIntervalMs: 600_000 });
    try {
      listener.emit("connected");
      mock.timers.tick(18_000);
      assert.equal(listener.sent.at(-1)?.cmd, 603);
      const join = { groupId: "202000000000000109", sourceId: "1", time: "1700000000000", totalMembers: 23, updateMembers: [{ id: "2", dName: "Ngô Khuê Lục" }] };
      const page = {
        controls: [
          { actionId: "8400012772351", content: { act_type: "profile", act: "update", data: "{}" } },
          { actionId: "8400012772352", content: { act_type: "group", act: "join_reject", data: JSON.stringify(join) } },
          { actionId: "8400012772353", content: { act_type: "group", act: "join", data: JSON.stringify(join) } },
        ],
        more: 0,
        lastActionId: "8400012772353",
        queueStatus: { "603_0": { lastId: "8400012772353" } },
      };
      const json = JSON.stringify({ error_code: 0, error_message: "", data: JSON.stringify(page), encrypt: 0 });
      const header = Buffer.from([1, 0, 0, 0]);
      header.writeUInt16LE(603, 1);
      listener.ws.emit("message", Buffer.concat([header, Buffer.from(json, "utf8")]));

      const rows = readThread(db, { threadId: "202000000000000109", threadType: "group", limit: 10 });
      assert.deepEqual(rows.map((r) => [r.msgType, r.source, r.text]), [["group_event", "old_messages", "Ngô Khuê Lục được 1 thêm vào nhóm"]]);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE user_id = '2'").get()?.n, 1);
      assert.equal(readReplayCursors(db).group_events, "8400012772353");
    } finally {
      handle.stop();
      mock.timers.reset();
    }
  });

  it("rớt mạng thì hẹn giờ nối lại; chớp-tắt quá ngưỡng thì dừng hẳn và báo", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    try {
      const { db, listener, gaveUp } = setup(3);
      assert.equal(listener.starts, 1);
      listener.emit("connected");
      listener.emit("closed", 1006, "mất mạng");
      mock.timers.tick(999);
      assert.equal(listener.starts, 1, "chưa tới backoff 1 giây thì chưa nối lại");
      mock.timers.tick(3000); // backoff 1s + jitter tối đa 3s
      assert.equal(listener.starts, 2);
      listener.emit("connected");
      listener.emit("closed", 1006, "");
      listener.emit("connected");
      listener.emit("closed", 1006, "");
      assert.equal(gaveUp(), true);
      const kinds = recentConnectionEvents(db, 10).map((e) => e.kind);
      assert.equal(kinds[0], "gave_up");
    } finally {
      mock.timers.reset();
    }
  });

  it("Zalo đóng kết nối: báo giờ tự nối lại + mã đóng; bấm 'Nối lại ngay' thì nối luôn; nối được thì hết hẹn", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-03-01T02:00:24.000Z") });
    try {
      const { listener, handle } = setup(5);
      listener.emit("connected");
      listener.emit("closed", 3000, "NOT_AUTHENTICATED");
      const info = handle.retryInfo();
      assert.deepEqual([info.closeCode, info.closeReason], [3000, "NOT_AUTHENTICATED"]);
      // Bộ test đặt chờ phiên trùng 60 giây (cộng jitter tối đa 3 giây)
      const wait = Date.parse(String(info.retryAt)) - Date.parse("2026-03-01T02:00:24.000Z");
      assert.ok(wait >= 60_000 && wait <= 63_000, `hẹn nối lại sau ${wait} ms`);
      assert.equal(listener.starts, 1);
      assert.equal(handle.reconnectNow(), true);
      assert.equal(listener.starts, 2, "nối lại ngay, không chờ giờ hẹn");
      assert.equal(handle.retryInfo().retryAt, null);
      assert.equal(handle.reconnectNow(), false, "không có lần nối lại nào đang hẹn");
      listener.emit("connected");
      assert.equal(handle.retryInfo().retryAt, null);
    } finally {
      mock.timers.reset();
    }
  });

  it("mất mạng kéo dài (lỗi DNS, chưa mở được kết nối): thử lại mãi, không tự tắt daemon", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    try {
      const { listener, gaveUp } = setup(3);
      for (let i = 0; i < 10; i++) {
        listener.emit("error", { error: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });
        listener.emit("closed", 1006, "");
        mock.timers.tick(10_000);
      }
      assert.equal(gaveUp(), false);
      assert.ok(listener.starts >= 10);
    } finally {
      mock.timers.reset();
    }
  });

  it("có handler cho 'error' nên lỗi giải mã không làm chết tiến trình", () => {
    const { listener } = setup();
    assert.doesNotThrow(() => listener.emit("error", new Error("decode lỗi")));
  });
});
