import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { draftMessageTool } from "../mcp/outbox-send-tool-handlers.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getOutboxItem, listOutbox, type OutboxReplyQuote } from "../storage/outbox-store.js";
import { OutboxSender } from "./outbox-sender-loop.js";
import { toZaloMessage } from "./outbox-zalo-message-content.js";

const env = parseEnv({});
const NOW = new Date("2026-11-09T03:00:00.000Z");
const live = { source: "live" as const, receivedAt: NOW.toISOString() };
const PROPS = { color: 0, size: 0, type: 0, subType: 0, ext: '{"shouldParseLinkOrContact":0}' };
const PHOTO = { title: "", href: "https://photo.zdn.vn/a.jpg", thumb: "https://photo.zdn.vn/t.jpg", params: "{}" };

/** Hội thoại u-lan có: tin chữ, tin chữ dài (Zalo lưu dạng { title }), ảnh, bình chọn, tin đã thu hồi; u-binh có một tin */
function setup() {
  const db = openArchiveDatabase(":memory:");
  const add = (msgId: string, o: Parameters<typeof sampleMessage>[0]) =>
    upsertMessage(db, sampleMessage({ msgId, cliMsgId: `c${msgId}`, sentAt: `2026-11-08T0${msgId.slice(-1)}:00:00.000Z`, ...o }), live);
  add("801", { text: "Mai họp lúc mấy giờ?", rawJson: JSON.stringify({ msgType: "webchat", content: "Mai họp lúc mấy giờ?", propertyExt: PROPS, uidFrom: "u-lan", ts: "1700000000106", ttl: 0 }) });
  add("802", { text: "Thông báo dài", rawJson: JSON.stringify({ msgType: "webchat", content: { title: "Thông báo dài\nnhiều dòng" }, uidFrom: "u-lan", ts: "1700000000800" }) });
  add("803", { msgType: "chat.photo", text: "", rawJson: JSON.stringify({ msgType: "chat.photo", content: PHOTO, uidFrom: "u-lan", ts: "1700000000900" }) });
  add("804", { msgType: "group.poll", text: "Bình chọn", rawJson: "{}" });
  add("805", { text: "tin đã thu hồi", rawJson: "{}" });
  db.prepare("UPDATE messages SET recalled_at = ? WHERE msg_id = '805'").run(NOW.toISOString());
  add("806", { threadId: "u-binh", senderId: "u-binh", senderName: "Bình", text: "chào" });
  const idOf = (msgId: string) => (db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { db, ctx: { db, env, readOnly: false, now: () => NOW }, idOf };
}

describe("gửi tin trả lời một tin (ô trích dẫn như Zalo)", () => {
  it("chụp tin gốc đúng dạng zca-js cần: chữ, chữ dài { title } thành chuỗi, ảnh giữ nguyên đối tượng", () => {
    const { db, ctx, idOf } = setup();
    for (const [msgId, text] of [["801", "8h nhé"], ["802", "đã đọc"], ["803", "ảnh đẹp"]] as const) {
      assert.equal(draftMessageTool(ctx, { thread_id: "u-lan", text, reply_to: idOf(msgId) }).ok, true);
    }
    const byText = new Map(listOutbox(db, { limit: 10 }).map((i) => [i.text, i.replyTo]));
    assert.deepEqual(byText.get("8h nhé"), {
      messageId: idOf("801"),
      content: "Mai họp lúc mấy giờ?",
      msgType: "webchat",
      propertyExt: PROPS,
      uidFrom: "u-lan",
      msgId: "801",
      cliMsgId: "c801",
      ts: "1700000000106",
      ttl: 0,
    });
    assert.equal(byText.get("đã đọc")?.content, "Thông báo dài\nnhiều dòng");
    assert.deepEqual(byText.get("ảnh đẹp")?.content, PHOTO);
    assert.equal(byText.get("ảnh đẹp")?.msgType, "chat.photo");
  });

  it("từ chối: tin của hội thoại khác, không có trong kho, đã thu hồi, bình chọn - không tạo mục nào", () => {
    const { db, ctx, idOf } = setup();
    const err = (reply_to: number) => {
      const r = draftMessageTool(ctx, { thread_id: "u-lan", text: `trả lời ${reply_to}`, reply_to });
      assert.equal(r.ok, false);
      return (r as { error?: string }).error ?? "";
    };
    assert.match(err(idOf("806")), /Không thấy tin #\d+ trong hội thoại/);
    assert.match(err(999_999), /Không thấy tin/);
    assert.match(err(idOf("805")), /đã bị thu hồi/);
    assert.match(err(idOf("804")), /bình chọn/);
    assert.equal(listOutbox(db, { limit: 10 }).length, 0);
  });

  it("nội dung cho zca-js: chữ trơn khi không có gì thêm; trả lời thì kèm quote, có cả nhắc tên thì kèm cả hai", () => {
    const quote: OutboxReplyQuote = { messageId: 1, content: "gốc", msgType: "webchat", propertyExt: undefined, uidFrom: "u-lan", msgId: "9", cliMsgId: "c9", ts: "1", ttl: 0 };
    assert.equal(toZaloMessage("chào", [], null), "chào");
    const { messageId: _drop, ...zaloQuote } = quote;
    assert.deepEqual(toZaloMessage("ok", [], quote), { msg: "ok", quote: zaloQuote });
    const mentions = [{ uid: "101", pos: 0, len: 6 }];
    assert.deepEqual(toZaloMessage("@Thanh ok", mentions, quote), { msg: "@Thanh ok", mentions, quote: zaloQuote });
  });

  it("daemon gửi kèm tin gốc; tin thường thì không", async () => {
    const { db, ctx, idOf } = setup();
    draftMessageTool(ctx, { thread_id: "u-lan", text: "8h nhé", reply_to: idOf("801") });
    draftMessageTool(ctx, { thread_id: "u-lan", text: "tin thường" });
    db.prepare("UPDATE outbox SET status = 'approved', approved_at = ?").run(NOW.toISOString());
    const calls: Array<{ text: string; replyMsgId: string | null }> = [];
    let clock = NOW;
    const sender = new OutboxSender({
      db,
      env,
      log: createSilentLogger(),
      sendText: async (_threadId, _type, text, _mentions, replyTo) => {
        calls.push({ text, replyMsgId: replyTo?.msgId ?? null });
        return { msgId: String(900 + calls.length) };
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
      { text: "8h nhé", replyMsgId: "801" },
      { text: "tin thường", replyMsgId: null },
    ]);
    assert.equal(getOutboxItem(db, 1)!.status, "sent");
  });
});
