import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { applyReaction } from "./message-reaction-store.js";
import { listMessagesMentioningMe, listMyMessagesWithReactions, searchMessages, threadSenders } from "./message-search-queries.js";
import { readThreadAfter, readThreadAround } from "./message-window-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T03:00:00.000Z" };
const at = (min: number) => new Date(Date.UTC(2026, 9, 30, 1, min)).toISOString();
const mentions = (list: Array<{ uid: string; type: number }>) => JSON.stringify({ mentions: list.map((m) => ({ ...m, pos: 0, len: 4 })) });

/** Nhóm g-1: Lan, Minh và mình nhắn; một tin có file */
function seeded() {
  const db = openArchiveDatabase(":memory:");
  db.prepare("INSERT INTO meta (key, value) VALUES ('self_uid', 'me')").run();
  const add = (msgId: string, min: number, o: Parameters<typeof sampleMessage>[0]) =>
    upsertMessage(db, sampleMessage({ msgId, cliMsgId: `c${msgId}`, threadId: "g-1", threadType: "group", sentAt: at(min), ...o }), live);
  add("1", 1, { senderId: "u-lan", senderName: "Lan", text: "Hẹn ở quán Quế Lư nhé" });
  add("2", 2, { senderId: "u-minh", senderName: "Minh", text: "@Khê xem giúp", rawJson: mentions([{ uid: "me", type: 0 }]) });
  add("3", 3, { senderId: "me", senderName: "Khê", isSelf: true, text: "Quế Lư ok" });
  add("4", 4, { senderId: "u-lan", senderName: "Lan", text: "@All họp nhé", rawJson: mentions([{ uid: "-1", type: 1 }]) });
  add("5", 5, { senderId: "u-minh", senderName: "Minh", text: "@Lan nhắc người khác", rawJson: mentions([{ uid: "u-lan", type: 0 }]) });
  add("6", 6, {
    senderId: "u-lan",
    senderName: "Lan",
    msgType: "share.file",
    text: "Quán Quế Lư.m4a",
    attachments: [{ kind: "file", remoteUrl: "https://f1.zdn.vn/a.m4a", fileName: "Quán Quế Lư.m4a", declaredSize: 6_150_000 }],
  });
  return db;
}

const ids = (rows: Array<{ msgId: string }>) => rows.map((r) => r.msgId);

describe("tìm và lọc tin", () => {
  it("lọc theo người gửi, có file / không file; không từ khóa vẫn lọc được theo người gửi", () => {
    const db = seeded();
    assert.deepEqual(ids(searchMessages(db, { query: "que lu", limit: 10 })), ["6", "3", "1"]);
    assert.deepEqual(ids(searchMessages(db, { query: "que lu", senderId: "u-lan", limit: 10 })), ["6", "1"]);
    assert.deepEqual(ids(searchMessages(db, { query: "que lu", files: "only", limit: 10 })), ["6"]);
    assert.deepEqual(ids(searchMessages(db, { query: "que lu", files: "exclude", limit: 10 })), ["3", "1"]);
    assert.deepEqual(ids(searchMessages(db, { senderId: "u-minh", threadId: "g-1", limit: 10 })), ["5", "2"]);
    assert.deepEqual(ids(searchMessages(db, { query: "que lu", limit: 1, offset: 1 })), ["3"], "trang sau");
    assert.deepEqual(searchMessages(db, { threadId: "g-1", limit: 10 }), [], "không từ khóa, không lọc: không liệt kê cả kho");
  });

  it("Nhắc bạn: tin @mình và @Tất cả của người khác; Biểu cảm: tin của mình được người khác thả", () => {
    const db = seeded();
    assert.deepEqual(ids(listMessagesMentioningMe(db, { selfUid: "me", limit: 10 })), ["4", "2"]);
    const react = (actionId: string, msgId: string, reactorId: string, min: number) =>
      applyReaction(db, { actionId, targetMsgIds: [msgId], reactorId, icon: "/-heart", reactedAt: at(min), threadId: "g-1", threadType: "group" });
    react("r1", "3", "me", 10); // tự thả vào tin mình: không tính
    react("r2", "1", "u-minh", 11); // tin người khác: không tính
    assert.deepEqual(listMyMessagesWithReactions(db, { selfUid: "me", limit: 10 }), []);
    react("r3", "3", "u-lan", 12);
    assert.deepEqual(ids(listMyMessagesWithReactions(db, { selfUid: "me", limit: 10 })), ["3"]);
    assert.deepEqual(listMessagesMentioningMe(db, { selfUid: null, limit: 10 }), [], "chưa biết uid mình thì thôi");
  });

  it("người gửi trong hội thoại: nhiều tin nhất trước, đánh dấu mình", () => {
    const db = seeded();
    assert.deepEqual(
      threadSenders(db, "g-1").map((s) => [s.senderId, s.count, s.isSelf]),
      [["u-lan", 3, false], ["u-minh", 2, false], ["me", 1, true]],
    );
  });

  it("nhảy tới một tin: trang quanh tin đó, rồi tải tiếp các tin mới hơn; tin của hội thoại khác thì null", () => {
    const db = seeded();
    const third = searchMessages(db, { query: "ok", limit: 1 })[0]!;
    const ref = { threadId: "g-1", threadType: "group" as const };
    assert.deepEqual(ids(readThreadAround(db, { ...ref, messageId: third.id, limit: 4 })!), ["1", "2", "3", "4"]);
    assert.deepEqual(ids(readThreadAfter(db, { ...ref, afterId: third.id, limit: 10 })), ["4", "5", "6"]);
    assert.equal(readThreadAround(db, { threadId: "u-khac", threadType: "user", messageId: third.id, limit: 4 }), null);
  });
});
