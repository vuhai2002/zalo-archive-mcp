import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { claimForSending, listOutbox, markSent } from "../storage/outbox-store.js";
import { setKillSwitch } from "../storage/send-control-store.js";
import { replaceFriendDirectory, setMeta } from "../storage/thread-directory-store.js";
import { draftMessageTool, scheduleMessageTool, sendBatchTool, sendMessageTool } from "./outbox-send-tool-handlers.js";

const env = parseEnv({});
const NOW = new Date("2026-10-28T03:00:00.000Z");
const live = { source: "live" as const, receivedAt: NOW.toISOString() };

function setup(daemonRunning = true) {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage({ msgId: "1" }), live);
  upsertMessage(db, sampleMessage({ msgId: "2", threadId: "u-binh", senderId: "u-binh", senderName: "Bình" }), live);
  upsertMessage(db, sampleMessage({ msgId: "3", threadId: "u-la", senderId: "u-la", senderName: "Người lạ" }), live);
  replaceFriendDirectory(db, [
    { threadId: "u-lan", name: "Lan" },
    { threadId: "u-binh", name: "Bình" },
  ]);
  if (daemonRunning) {
    setMeta(db, "daemon_session_state", "running");
    setMeta(db, "listener_heartbeat_at", NOW.toISOString());
  }
  return { db, ctx: { db, env, readOnly: false, now: () => NOW, sleep: async () => {}, waitTimeoutMs: 50 } };
}

describe("send_message", () => {
  it("xếp tin lẻ đã duyệt, chờ daemon gửi xong rồi báo đã gửi", async () => {
    const { db, ctx } = setup();
    // Giả daemon: thấy mục approved thì gửi luôn
    const fakeDaemon = async () => {
      const item = listOutbox(db, { statuses: ["approved"], limit: 1 })[0]!;
      claimForSending(db, item.id);
      markSent(db, item.id, "99");
    };
    const r = await sendMessageTool({ ...ctx, sleep: fakeDaemon, waitTimeoutMs: 5_000 }, { thread_id: "u-la", text: "Chào bạn" });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.match(r.ok ? r.text : "", /Đã gửi/);
    assert.deepEqual(listOutbox(db, { limit: 5 }).map((i) => [i.mode, i.status, i.createdBy]), [["single", "sent", "mcp"]]);
  });

  it("daemon chưa gửi kịp: HỦY mục, báo chưa gửi (không để tin đi muộn ngoài ý)", async () => {
    const { db, ctx } = setup();
    const r = await sendMessageTool(ctx, { thread_id: "u-lan", text: "x" });
    assert.ok(!r.ok && /HỦY/.test(r.error));
    assert.equal(listOutbox(db, { limit: 1 })[0]!.status, "cancelled");
  });

  it("đang khóa gửi: báo lỗi ngay, không xếp hàng", async () => {
    const { db, ctx } = setup();
    setKillSwitch(db, true, "lỗi gửi trước");
    const r = await sendMessageTool(ctx, { thread_id: "u-lan", text: "x" });
    assert.ok(!r.ok && /KHÓA/.test(r.error));
    assert.equal(listOutbox(db, { limit: 5 }).length, 0);
  });

  it("heartbeat cũ (daemon chết): từ chối ngay", async () => {
    const { db, ctx } = setup();
    setMeta(db, "listener_heartbeat_at", "2026-10-28T02:00:00.000Z");
    const r = await sendMessageTool(ctx, { thread_id: "u-lan", text: "x" });
    assert.equal(r.ok, false);
  });

  it("từ chối hội thoại lạ, tin trùng đang chờ, ký tự điều khiển", async () => {
    const { ctx } = setup();
    assert.equal((await sendMessageTool(ctx, { thread_id: "khong-co", text: "x" })).ok, false);
    await sendMessageTool(ctx, { thread_id: "u-lan", text: "y" });
    assert.equal((await sendMessageTool(ctx, { thread_id: "u-lan", text: " y " })).ok, false);
    assert.equal((await sendMessageTool(ctx, { thread_id: "u-lan", text: "a\rb" })).ok, false);
  });
});

describe("schedule_message, send_batch, draft_message", () => {
  it("hẹn giờ theo giờ của kho, không nhận giờ đã qua", () => {
    const { db, ctx } = setup();
    assert.equal(scheduleMessageTool(ctx, { thread_id: "u-lan", text: "x", send_date: "2026-10-28", send_time: "09:00" }).ok, false);
    assert.ok(scheduleMessageTool(ctx, { thread_id: "u-lan", text: "x", send_date: "2026-10-28", send_time: "11:00" }).ok);
    // 11:00 giờ VN = 04:00 UTC
    assert.equal(listOutbox(db, { limit: 1 })[0]!.notBefore, "2026-10-28T04:00:00.000Z");
  });

  it("lô: chỉ bạn bè, mỗi người một nội dung riêng, tất cả hoặc không có gì", () => {
    const { db, ctx } = setup();
    const items = (a: string, b: string, third?: string) => [
      { thread_id: "u-lan", text: a },
      { thread_id: third ?? "u-binh", text: b },
    ];
    assert.equal(sendBatchTool(ctx, { items: items("Chúc mừng", "Chúc mừng") }).ok, false);
    assert.equal(sendBatchTool(ctx, { items: items("A", "B", "u-la") }).ok, false, "người lạ không vào lô");
    assert.equal(listOutbox(db, { limit: 10 }).length, 0);
    assert.ok(sendBatchTool(ctx, { items: items("Chào Lan", "Chào Bình") }).ok);
    const rows = listOutbox(db, { limit: 10 });
    assert.deepEqual(rows.map((i) => [i.mode, i.status]), [["batch", "approved"], ["batch", "approved"]]);
    assert.equal(new Set(rows.map((i) => i.batchId)).size, 1);
  });

  it("nháp nằm ở draft, không bao giờ tự gửi", () => {
    const { db, ctx } = setup(false);
    assert.ok(draftMessageTool(ctx, { thread_id: "u-lan", text: "để tôi xem" }).ok);
    assert.equal(listOutbox(db, { limit: 1 })[0]!.status, "draft");
  });
});

describe("nick Chỉ đọc", () => {
  it("mọi tool gửi / soạn từ chối với lý do rõ, không xếp gì vào hàng đợi", async () => {
    const { db, ctx } = setup();
    const ro = { ...ctx, readOnly: true };
    const results = [
      await sendMessageTool(ro, { thread_id: "u-lan", text: "x" }),
      scheduleMessageTool(ro, { thread_id: "u-lan", text: "x", send_date: "2026-10-28", send_time: "11:00" }),
      sendBatchTool(ro, { items: [{ thread_id: "u-lan", text: "A" }, { thread_id: "u-binh", text: "B" }] }),
      draftMessageTool(ro, { thread_id: "u-lan", text: "nháp" }),
    ];
    for (const r of results) {
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /Chỉ đọc/);
    }
    assert.deepEqual(listOutbox(db, { limit: 10 }), []);
  });
});
