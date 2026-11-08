import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { draftMessageTool } from "../mcp/outbox-send-tool-handlers.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { replaceGroupMembers } from "../storage/group-member-store.js";
import { findThread } from "../storage/message-read-queries.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getOutboxItem, listOutbox, type OutboxMention } from "../storage/outbox-store.js";
import { OutboxSender } from "./outbox-sender-loop.js";
import { resolveOutboxMentions } from "./resolve-outbox-mentions.js";

const env = parseEnv({});
const NOW = new Date("2026-11-08T03:00:00.000Z");
const live = { source: "live" as const, receivedAt: NOW.toISOString() };

/** Nhóm g-1: Thanh (101) và Mc (102) là thành viên; Phuong (103) chỉ từng nhắn trong nhóm (nhóm đông, danh sách thiếu) */
function setup() {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage({ msgId: "1", threadId: "g-1", threadType: "group", senderId: "103", senderName: "Phuong" }), live);
  upsertMessage(db, sampleMessage({ msgId: "2", threadId: "u-lan", senderId: "u-lan", senderName: "Lan" }), live);
  replaceGroupMembers(db, "g-1", ["101", "102"], 40);
  return db;
}

describe("nhắc tên (@) trong tin gửi vào nhóm", () => {
  it("tự tìm vị trí + độ dài từng đoạn @Tên theo đúng thứ tự, đơn vị ký tự như Zalo", () => {
    const db = setup();
    const group = findThread(db, "g-1")!;
    const text = "@Thanh mai họp lúc mấy giờ, @Phuong nhắn lại giúp nhé. @Thanh nhớ mang laptop";
    const r = resolveOutboxMentions(db, group, text, [
      { userId: "101", text: "@Thanh" },
      { userId: "103", text: "@Phuong" },
      { userId: "101", text: "@Thanh" },
    ]);
    assert.deepEqual(r, [
      { uid: "101", pos: 0, len: 6 },
      { uid: "103", pos: text.indexOf("@Phuong"), len: 7 },
      { uid: "101", pos: text.lastIndexOf("@Thanh"), len: 6 },
    ]);
    assert.deepEqual(resolveOutboxMentions(db, group, "@Lã Văn Khê ơi", [{ userId: "102", text: "@Lã Văn Khê" }]), [{ uid: "102", pos: 0, len: 11 }]);
  });

  it("từ chối: tin 1-1, người ngoài nhóm, đoạn @ không có trong tin, thiếu @", () => {
    const db = setup();
    const group = findThread(db, "g-1")!;
    const err = (r: unknown) => (r as { error?: string }).error ?? "";
    assert.match(err(resolveOutboxMentions(db, findThread(db, "u-lan")!, "@Lan ơi", [{ userId: "u-lan", text: "@Lan" }])), /trong nhóm/);
    assert.match(err(resolveOutboxMentions(db, group, "@Ai đó", [{ userId: "999", text: "@Ai đó" }])), /không phải thành viên/);
    assert.match(err(resolveOutboxMentions(db, group, "chào chị", [{ userId: "101", text: "@Thanh" }])), /Không thấy "@Thanh"/);
    assert.match(err(resolveOutboxMentions(db, group, "Thanh ơi", [{ userId: "101", text: "Thanh" }])), /bắt đầu bằng @/);
    assert.deepEqual(resolveOutboxMentions(db, group, "không nhắc ai", undefined), []);
  });

  it("tool MCP lưu danh sách nhắc vào hàng đợi; sai thì không tạo mục nào", () => {
    const db = setup();
    const ctx = { db, env, readOnly: false, now: () => NOW };
    const ok = draftMessageTool(ctx, { thread_id: "g-1", text: "@Thanh gửi lịch họp giúp nhé", mentions: [{ user_id: "101", text: "@Thanh" }] });
    assert.equal(ok.ok, true);
    assert.deepEqual(listOutbox(db, { limit: 5 })[0]!.mentions, [{ uid: "101", pos: 0, len: 6 }]);
    const bad = draftMessageTool(ctx, { thread_id: "g-1", text: "@Thanh khác", mentions: [{ user_id: "999", text: "@Thanh" }] });
    assert.equal(bad.ok, false);
    assert.equal(listOutbox(db, { limit: 5 }).length, 1);
  });

  it("daemon gửi kèm danh sách nhắc; tin không nhắc ai thì danh sách rỗng", async () => {
    const db = setup();
    const ctx = { db, env, readOnly: false, now: () => NOW };
    draftMessageTool(ctx, { thread_id: "g-1", text: "@Thanh chị xem nhé", mentions: [{ user_id: "101", text: "@Thanh" }] });
    draftMessageTool(ctx, { thread_id: "g-1", text: "tin thường" });
    db.prepare("UPDATE outbox SET status = 'approved', approved_at = ?").run(NOW.toISOString());
    const calls: Array<{ text: string; mentions: OutboxMention[] }> = [];
    let clock = NOW;
    const sender = new OutboxSender({
      db,
      env,
      log: createSilentLogger(),
      sendText: async (_threadId, _type, text, mentions) => {
        calls.push({ text, mentions });
        return { msgId: String(500 + calls.length) };
      },
      sendTyping: async () => {},
      sleep: async () => {},
      isListenerConnected: () => true,
      isReadOnly: () => false,
      now: () => clock,
      random: () => 0,
    });
    await sender.tick();
    clock = new Date(clock.getTime() + 10_000);
    await sender.tick();
    assert.deepEqual(calls, [
      { text: "@Thanh chị xem nhé", mentions: [{ uid: "101", pos: 0, len: 6 }] },
      { text: "tin thường", mentions: [] },
    ]);
    assert.equal(getOutboxItem(db, 1)!.status, "sent");
  });
});
