import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closeDanglingConnection, listenerGaps, recordConnectionEvent } from "./connection-event-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("connection events", () => {
  it("tính khoảng không nghe từ closed tới connected kế tiếp, gộp các lần đóng liền nhau", () => {
    const db = openArchiveDatabase(":memory:");
    recordConnectionEvent(db, "connected", { at: "2026-10-28T01:00:00.000Z" });
    recordConnectionEvent(db, "closed", { at: "2026-10-28T02:00:00.000Z", code: 1006 });
    recordConnectionEvent(db, "closed", { at: "2026-10-28T02:01:00.000Z", code: 1006 });
    recordConnectionEvent(db, "connected", { at: "2026-10-28T02:05:00.000Z" });
    recordConnectionEvent(db, "closed", { at: "2026-10-28T03:00:00.000Z", code: 3000 });
    assert.deepEqual(listenerGaps(db, "2026-10-28T00:00:00.000Z"), [
      { from: "2026-10-28T03:00:00.000Z", to: null, closeCode: 3000 },
      { from: "2026-10-28T02:00:00.000Z", to: "2026-10-28T02:05:00.000Z", closeCode: 1006 },
    ]);
  });

  it("khoảng bắt đầu TRƯỚC cửa sổ xem vẫn được báo (daemon tắt từ 10 ngày trước)", () => {
    const db = openArchiveDatabase(":memory:");
    recordConnectionEvent(db, "connected", { at: "2026-10-10T01:00:00.000Z" });
    recordConnectionEvent(db, "stopped", { at: "2026-10-18T01:00:00.000Z" });
    assert.deepEqual(listenerGaps(db, "2026-10-21T00:00:00.000Z"), [
      { from: "2026-10-21T00:00:00.000Z", to: null, closeCode: null },
    ]);
  });

  it("đang 'connected' mà heartbeat đã cũ: báo khoảng nghi ngờ; heartbeat mới thì không", () => {
    const db = openArchiveDatabase(":memory:");
    recordConnectionEvent(db, "connected", { at: "2026-10-28T01:00:00.000Z" });
    const opts = { nowIso: "2026-10-28T03:00:00.000Z", staleAfterMs: 180_000 };
    assert.deepEqual(listenerGaps(db, "2026-10-21T00:00:00.000Z", { ...opts, lastHeartbeatAt: "2026-10-28T02:00:00.000Z" }), [
      { from: "2026-10-28T02:00:00.000Z", to: null, closeCode: null, suspected: true },
    ]);
    assert.deepEqual(listenerGaps(db, "2026-10-21T00:00:00.000Z", { ...opts, lastHeartbeatAt: "2026-10-28T02:59:30.000Z" }), []);
  });

  it("sự kiện 'error' sau 'connected' không che mất việc ghi bù khi tiến trình chết", () => {
    const db = openArchiveDatabase(":memory:");
    recordConnectionEvent(db, "connected", { at: "2026-10-28T01:00:00.000Z" });
    recordConnectionEvent(db, "error", { at: "2026-10-28T01:10:00.000Z", detail: "decode" });
    assert.equal(closeDanglingConnection(db, "2026-10-28T01:20:00.000Z"), true);
  });

  it("ghi bù closed khi tiến trình chết đột ngột, theo mốc heartbeat cuối", () => {
    const db = openArchiveDatabase(":memory:");
    recordConnectionEvent(db, "connected", { at: "2026-10-28T01:00:00.000Z" });
    assert.equal(closeDanglingConnection(db, "2026-10-28T01:30:00.000Z"), true);
    assert.equal(closeDanglingConnection(db, "2026-10-28T01:30:00.000Z"), false, "không ghi bù hai lần");
    recordConnectionEvent(db, "connected", { at: "2026-10-28T02:00:00.000Z" });
    assert.deepEqual(listenerGaps(db, "2026-10-28T00:00:00.000Z"), [
      { from: "2026-10-28T01:30:00.000Z", to: "2026-10-28T02:00:00.000Z", closeCode: null },
    ]);
  });
});
