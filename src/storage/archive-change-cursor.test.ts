import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectArchiveChanges, currentChangeCursor } from "./archive-change-cursor.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { markAttachmentDone } from "./attachment-queue-store.js";
import { recordRecall, upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T01:00:00.000Z" };

describe("dò thay đổi trong kho cho dashboard tự cập nhật", () => {
  it("báo đúng hội thoại có tin mới, thu hồi, file vừa tải xong; không đổi thì rỗng", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", threadId: "u-lan" }), live);
    let cursor = currentChangeCursor(db);
    assert.deepEqual(collectArchiveChanges(db, cursor).threadIds, [], "chưa đổi gì");

    upsertMessage(db, sampleMessage({ msgId: "2", threadId: "u-binh", senderId: "u-binh" }), live);
    let r = collectArchiveChanges(db, cursor);
    assert.deepEqual(r.threadIds, ["u-binh"]);
    cursor = r.cursor;

    recordRecall(db, { msgId: "1", threadId: "u-lan", recalledBy: "u-lan", recalledAt: "2026-10-30T02:00:00.000Z", rawJson: "{}" });
    r = collectArchiveChanges(db, cursor);
    assert.deepEqual(r.threadIds, ["u-lan"]);
    cursor = r.cursor;

    upsertMessage(db, sampleMessage({ msgId: "3", threadId: "g-1", threadType: "group", attachments: [{ kind: "photo", remoteUrl: "https://f.zdn.vn/a.jpg", fileName: null, declaredSize: null }] }), live);
    cursor = collectArchiveChanges(db, cursor).cursor;
    markAttachmentDone(db, 1, { localPath: "ab/a.jpg", sha256: "ab", sizeBytes: 3, mime: "image/jpeg" });
    r = collectArchiveChanges(db, cursor);
    assert.deepEqual(r.threadIds, ["g-1"]);
    assert.deepEqual(collectArchiveChanges(db, r.cursor).threadIds, []);
  });
});
