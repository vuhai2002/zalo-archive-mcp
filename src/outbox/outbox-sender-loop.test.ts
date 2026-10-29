import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { enqueueOutboxItem, getOutboxItem, type OutboxMode } from "../storage/outbox-store.js";
import { getKillSwitch, setKillSwitch } from "../storage/send-control-store.js";
import { replaceFriendDirectory } from "../storage/thread-directory-store.js";
import { OutboxSender, type SendTextFn, type TypingFn } from "./outbox-sender-loop.js";

const env = parseEnv({ ZALO_ACCOUNT_ID: "test" });
// 10:00 giờ VN
const AT_10AM = new Date("2026-10-28T03:00:00.000Z");

function setup(opts: { now?: Date; connected?: boolean; send?: SendTextFn; typing?: TypingFn } = {}) {
  const db = openArchiveDatabase(":memory:");
  replaceFriendDirectory(db, [
    { threadId: "u-lan", name: "Lan" },
    { threadId: "u-binh", name: "Bình" },
  ]);
  const sent: Array<[string, string]> = [];
  let clock = opts.now ?? AT_10AM;
  const sender = new OutboxSender({
    db,
    env,
    log: createSilentLogger(),
    sendText:
      opts.send ??
      (async (threadId, _type, text) => {
        sent.push([threadId, text]);
        return { msgId: String(1000 + sent.length) };
      }),
    sendTyping: opts.typing ?? (async () => {}),
    sleep: async () => {},
    isListenerConnected: () => opts.connected ?? true,
    now: () => clock,
    random: () => 0,
  });
  const queue = (threadId: string, text: string, mode: OutboxMode = "single") =>
    enqueueOutboxItem(db, {
      threadId,
      threadType: "user",
      text,
      mode,
      notBefore: null,
      batchId: mode === "batch" ? "b1" : null,
      createdBy: "mcp",
      note: null,
      status: "approved",
    });
  return { db, sender, sent, queue, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

describe("OutboxSender", () => {
  it("nháp chưa duyệt không bao giờ được gửi", async () => {
    const { db, sender, sent } = setup();
    enqueueOutboxItem(db, {
      threadId: "u-lan", threadType: "user", text: "x", mode: "single", notBefore: null, batchId: null,
      createdBy: "mcp", note: null, status: "draft",
    });
    await sender.tick();
    assert.equal(sent.length, 0);
  });

  it("tin lẻ: nhiều tin cho cùng một người, kể cả người lạ, lúc nửa đêm - chỉ cách nhau vài giây", async () => {
    const { sender, sent, queue, advance } = setup({ now: new Date("2026-10-28T17:00:00.000Z") }); // 0h giờ VN
    queue("u-nguoi-la", "Một");
    queue("u-nguoi-la", "Hai");
    await sender.tick();
    assert.ok((await sender.tick()) > 0, "tin thứ hai chờ đủ 3 giây");
    assert.equal(sent.length, 1);
    advance(3_000);
    await sender.tick();
    assert.deepEqual(sent, [["u-nguoi-la", "Một"], ["u-nguoi-la", "Hai"]]);
  });

  it("lô: người không phải bạn bè bị đánh failed; tin lô đang chờ nhịp không chặn tin lẻ", async () => {
    const { db, sender, sent, queue, advance } = setup();
    const stranger = queue("u-nguoi-la", "lô tới người lạ", "batch");
    queue("u-lan", "lô 1", "batch");
    queue("u-binh", "lô 2", "batch");
    await sender.tick(); // người lạ -> failed
    assert.equal(getOutboxItem(db, stranger)!.status, "failed");
    advance(5_000);
    await sender.tick(); // lô 1 đi (chưa có tin lô nào trước đó)
    queue("u-lan", "tin lẻ chen ngang");
    advance(5_000);
    await sender.tick(); // lô 2 chưa đủ nhịp 45 giây -> bị dời riêng
    await sender.tick(); // tin lẻ đi ngay
    assert.deepEqual(sent.map((s) => s[1]), ["lô 1", "tin lẻ chen ngang"]);
  });

  it("người dùng khóa trong lúc 'đang soạn': không gửi, trả tin về approved, không tính là lần thử", async () => {
    let db!: ReturnType<typeof setup>["db"];
    const ctx = setup({ typing: async () => setKillSwitch(db, true, "người dùng bấm khóa") });
    db = ctx.db;
    const id = ctx.queue("u-lan", "x");
    await ctx.sender.tick();
    assert.equal(ctx.sent.length, 0);
    const item = getOutboxItem(db, id)!;
    assert.equal(item.status, "approved");
    assert.equal(item.sendingStartedAt, null);
  });

  it("listener đang rớt thì không gửi", async () => {
    const { sender, sent, queue } = setup({ connected: false });
    queue("u-lan", "x");
    await sender.tick();
    assert.equal(sent.length, 0);
  });

  it("tin chờ quá maxLatenessHours thì bỏ, không gửi muộn", async () => {
    const { db, sender, sent, queue } = setup();
    const id = queue("u-lan", "x");
    db.prepare("UPDATE outbox SET approved_at = ? WHERE id = ?").run("2026-10-27T10:00:00.000Z", id);
    await sender.tick();
    assert.equal(sent.length, 0);
    assert.match(getOutboxItem(db, id)!.error ?? "", /Quá hạn/);
  });

  it("lô bị dời (ngoài khung giờ) giữ nguyên giờ dự kiến; treo quá 48 giờ thì bỏ", async () => {
    const night = new Date("2026-10-28T16:30:00.000Z"); // 23:30 giờ VN, ngoài khung 7h-22h của lô
    const { db, sender, sent, queue, advance } = setup({ now: night });
    const id = queue("u-lan", "lô", "batch");
    await sender.tick();
    const deferred = getOutboxItem(db, id)!;
    assert.equal(deferred.status, "approved");
    assert.equal(deferred.notBefore, null, "not_before không bị sửa khi dời");
    advance(49 * 3_600_000);
    await sender.tick();
    assert.equal(sent.length, 0);
    assert.match(getOutboxItem(db, id)!.error ?? "", /Quá hạn/);
  });

  it("lỗi gửi đầu tiên: đánh failed, BẬT kill switch, không gửi lại", async () => {
    let calls = 0;
    const { db, sender, queue, advance } = setup({
      send: async () => {
        calls++;
        throw new Error("Zalo báo quá nhiều yêu cầu");
      },
    });
    const id = queue("u-lan", "x");
    queue("u-binh", "y");
    await sender.tick();
    assert.equal(getOutboxItem(db, id)!.status, "failed");
    assert.equal(getKillSwitch(db).killed, true);
    advance(600_000);
    await sender.tick();
    assert.equal(calls, 1, "kill switch chặn mọi lần gửi sau");
  });

  it("Zalo không trả msgId: coi là hỏng và khóa (không đoán là đã gửi)", async () => {
    const { db, sender, queue } = setup({ send: async () => ({ msgId: null }) });
    const id = queue("u-lan", "x");
    await sender.tick();
    assert.equal(getOutboxItem(db, id)!.status, "failed");
    assert.equal(getKillSwitch(db).killed, true);
  });
});
