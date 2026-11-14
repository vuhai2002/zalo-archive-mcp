import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { recordBackfillRun } from "./backfill-run-store.js";
import type { ListenerGap } from "./connection-event-store.js";
import { annotateGapsWithBackfill } from "./listener-gap-backfill.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

const FROM = "2026-03-10T07:00:00.000Z";
const TO = "2026-03-10T09:00:00.000Z";
const live = { source: "live" as const, receivedAt: TO };

describe("annotateGapsWithBackfill", () => {
  it("khoảng đã đóng: kèm kết quả lấy bù và số tin kho có trong khoảng", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", sentAt: "2026-03-10T08:00:00.000Z" }), live);
    upsertMessage(db, sampleMessage({ msgId: "2", sentAt: "2026-03-10T08:30:00.000Z" }), live);
    upsertMessage(db, sampleMessage({ msgId: "3", sentAt: "2026-03-10T10:00:00.000Z" }), live);
    for (const queue of ["user_messages", "group_messages"]) {
      recordBackfillRun(db, { queue, startedAt: TO, finishedAt: TO, pages: 1, items: 1, outcome: "complete", detail: null });
    }
    const [g] = annotateGapsWithBackfill(db, [{ from: FROM, to: TO, closeCode: null, asleep: true }]);
    assert.deepEqual([g?.backfill, g?.messagesInGap, g?.backfillItems], ["filled", 2, 2]);
  });

  it("khoảng chưa nối lại hay chỉ suy từ heartbeat: không gắn gì", () => {
    const db = openArchiveDatabase(":memory:");
    const gaps: ListenerGap[] = [
      { from: FROM, to: null, closeCode: null },
      { from: FROM, to: TO, closeCode: null, suspected: true },
    ];
    for (const g of annotateGapsWithBackfill(db, gaps)) assert.equal(g.backfill, undefined);
  });
});
