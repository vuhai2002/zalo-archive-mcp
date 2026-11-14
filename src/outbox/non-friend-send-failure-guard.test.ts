import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { enqueueOutboxItem, getOutboxItem } from "../storage/outbox-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { replaceFriendDirectory } from "../storage/thread-directory-store.js";
import { OutboxSender } from "./outbox-sender-loop.js";

const env = parseEnv({});
// 10:00 giờ VN
const AT_10AM = new Date("2026-03-10T03:00:00.000Z");

/** Vòng gửi thật với Zalo giả: người nhận nằm trong `failFor` thì Zalo báo lỗi */
function setup() {
  const db = openArchiveDatabase(":memory:");
  replaceFriendDirectory(db, [{ threadId: "u-lan", name: "Lan" }]);
  const failFor = new Set<string>();
  let clock = AT_10AM;
  const sender = new OutboxSender({
    db,
    env,
    log: createSilentLogger(),
    sendText: async (threadId) => {
      if (failFor.has(threadId)) throw new Error("Người này không nhận tin nhắn từ người lạ");
      return { msgId: String(clock.getTime()) };
    },
    forwardText: async () => ({ msgId: "1" }),
    sendTyping: async () => {},
    sleep: async () => {},
    isListenerConnected: () => true,
    isReadOnly: () => false,
    now: () => clock,
    random: () => 0,
  });
  /** Xếp một tin lẻ rồi cho vòng gửi chạy một lượt, tua 5 giây (dư nhịp 3 giây giữa hai tin lẻ) */
  const sendOne = async (threadId: string) => {
    const id = enqueueOutboxItem(db, {
      threadId, threadType: "user", text: `tin ${id_seq++}`, mode: "single", notBefore: null, batchId: null,
      createdBy: "mcp", note: null, status: "approved",
    });
    await sender.tick();
    clock = new Date(clock.getTime() + 5_000);
    return getOutboxItem(db, id)!;
  };
  let id_seq = 1;
  return { db, failFor, sendOne };
}

describe("lỗi gửi tới người chưa kết bạn", () => {
  it("một tin hỏng: tin đó failed, không khóa", async () => {
    const t = setup();
    t.failFor.add("u-chua-ket-ban-1");
    const item = await t.sendOne("u-chua-ket-ban-1");
    assert.equal(item.status, "failed");
    assert.match(item.error ?? "", /người chưa kết bạn/);
    assert.equal(getKillSwitch(t.db).killed, false);
  });

  it("3 người chưa kết bạn liền nhau hỏng: bật khóa", async () => {
    const t = setup();
    for (const u of ["u-chua-ket-ban-1", "u-chua-ket-ban-2", "u-chua-ket-ban-3"]) t.failFor.add(u);
    await t.sendOne("u-chua-ket-ban-1");
    await t.sendOne("u-chua-ket-ban-2");
    assert.equal(getKillSwitch(t.db).killed, false);
    await t.sendOne("u-chua-ket-ban-3");
    assert.equal(getKillSwitch(t.db).killed, true);
    assert.match(getKillSwitch(t.db).reason ?? "", /3 người chưa kết bạn/);
  });

  it("hỏng, gửi được, hỏng, hỏng: không khóa", async () => {
    const t = setup();
    for (const u of ["u-chua-ket-ban-1", "u-chua-ket-ban-3", "u-chua-ket-ban-4"]) t.failFor.add(u);
    await t.sendOne("u-chua-ket-ban-1");
    assert.equal((await t.sendOne("u-chua-ket-ban-2")).status, "sent");
    await t.sendOne("u-chua-ket-ban-3");
    await t.sendOne("u-chua-ket-ban-4");
    assert.equal(getKillSwitch(t.db).killed, false);
  });

  it("cùng một người chưa kết bạn hỏng 3 lần: không khóa", async () => {
    const t = setup();
    t.failFor.add("u-chua-ket-ban-1");
    for (let i = 0; i < 3; i++) await t.sendOne("u-chua-ket-ban-1");
    assert.equal(getKillSwitch(t.db).killed, false);
  });

  it("tin tới bạn bè hỏng: khóa như cũ", async () => {
    const t = setup();
    t.failFor.add("u-lan");
    const item = await t.sendOne("u-lan");
    assert.equal(item.status, "failed");
    assert.equal(getKillSwitch(t.db).killed, true);
  });
});
