import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { setThreadPinned } from "./thread-pin-store.js";
import { listThreads, listThreadsPage } from "./thread-list-queries.js";

const live = { source: "live" as const, receivedAt: "2026-10-29T03:00:00.000Z" };
const at = (msgId: string, threadId: string, sentAt: string) => sampleMessage({ msgId, threadId, senderId: threadId, sentAt });

describe("ghim hội thoại trên dashboard", () => {
  it("hội thoại ghim lên đầu (ghim sau đứng trước), còn lại mới nhất trước; bỏ ghim thì về chỗ cũ", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, at("1", "u-a", "2026-10-29T01:00:00.000Z"), live);
    upsertMessage(db, at("2", "u-b", "2026-10-29T02:00:00.000Z"), live);
    upsertMessage(db, at("3", "u-c", "2026-10-29T03:00:00.000Z"), live);
    const ids = () => listThreadsPage(db, { limit: 10, offset: 0, pinnedFirst: true }).threads.map((t) => [t.threadId, t.pinned]);

    assert.equal(setThreadPinned(db, "u-a", true, "2026-10-29T05:00:00.000Z"), true);
    setThreadPinned(db, "u-b", true, "2026-10-29T06:00:00.000Z");
    assert.deepEqual(ids(), [["u-b", true], ["u-a", true], ["u-c", false]]);
    setThreadPinned(db, "u-b", false, "2026-10-29T07:00:00.000Z");
    assert.deepEqual(ids(), [["u-a", true], ["u-c", false], ["u-b", false]]);
    // MCP (listThreads) vẫn xếp mới nhất trước, không theo ghim
    assert.deepEqual(listThreads(db, { limit: 10 }).map((t) => t.threadId), ["u-c", "u-b", "u-a"]);
    assert.equal(setThreadPinned(db, "khong-co", true, "2026-10-29T08:00:00.000Z"), false);
  });
});
