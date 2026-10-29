import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { upsertContacts } from "./contact-store.js";
import { readThread } from "./message-read-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { lastMessagePreview } from "./thread-list-extras.js";

const live = { source: "live" as const, receivedAt: "2026-10-29T14:00:00.000Z" };
const event = (msgId: string, text: string) =>
  sampleMessage({ msgId, threadId: "g-1", threadType: "group", senderId: "system", msgType: "group_event", text });

describe("sự kiện nhóm ghi lúc chưa biết tên thành viên", () => {
  it("lúc đọc, mã số thành viên đổi thành tên trong danh bạ; chưa biết tên thì giữ mã", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, event("1", "2160000000000000101 đã rời nhóm"), live);
    upsertMessage(db, event("2", "213000000000000105 đã thêm 211000000000000102 vào nhóm"), live);
    upsertContacts(db, [
      { userId: "2160000000000000101", displayName: "Lan", avatarUrl: null },
      { userId: "213000000000000105", displayName: "Minh", avatarUrl: null },
    ]);
    const texts = readThread(db, { threadId: "g-1", threadType: "group", limit: 10 }).map((m) => m.text);
    assert.deepEqual(texts, ["Lan đã rời nhóm", "Minh đã thêm 211000000000000102 vào nhóm"]);
    assert.equal(lastMessagePreview(db, "g-1", "group")!.text, "Minh đã thêm 211000000000000102 vào nhóm");
  });

  it("tin chữ thường có dãy số dài thì không đổi (chỉ sự kiện nhóm)", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", text: "mã đơn 2160000000000000101" }), live);
    upsertContacts(db, [{ userId: "2160000000000000101", displayName: "Lan", avatarUrl: null }]);
    assert.equal(readThread(db, { threadId: "u-lan", threadType: "user", limit: 5 })[0]!.text, "mã đơn 2160000000000000101");
  });
});
