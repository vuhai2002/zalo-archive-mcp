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
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { startArchiveListener } from "./archive-listener.js";

class FakeListener extends EventEmitter {
  starts = 0;
  start() {
    this.starts++;
  }
  stop() {}
  requestOldMessages() {}
}

function setup(giveUpAfterFlaps = 3) {
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
    offlineReplay: null,
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
