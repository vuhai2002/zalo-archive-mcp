import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { backfillForGap, recordBackfillRun, recordNewSessionBackfill, type BackfillRun } from "./backfill-run-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

// Khoảng không nghe kết thúc (nối lại) lúc 16:00 giờ VN
const GAP_END = "2026-03-10T09:00:00.000Z";
const at = (minutesAfterGapEnd: number) => new Date(Date.parse(GAP_END) + minutesAfterGapEnd * 60_000).toISOString();
const run = (o: Partial<BackfillRun>): BackfillRun => ({
  queue: "user_messages",
  startedAt: at(0),
  finishedAt: at(0.2),
  pages: 1,
  items: 0,
  outcome: "complete",
  detail: null,
  ...o,
});

let db = openArchiveDatabase(":memory:");
beforeEach(() => {
  db = openArchiveDatabase(":memory:");
});

describe("backfillForGap", () => {
  it("lấy bù cả tin 1-1 lẫn tin nhóm xong ngay sau khoảng: đã lấy bù đủ, cộng số tin Zalo gửi lại", () => {
    recordBackfillRun(db, run({ queue: "user_messages", items: 1 }));
    recordBackfillRun(db, run({ queue: "group_messages", startedAt: at(0.1), items: 10 }));
    assert.deepEqual(backfillForGap(db, GAP_END), { status: "filled", items: 11, detail: null });
  });

  it("một hàng chờ tin dừng dở: có thể thiếu, kèm lý do", () => {
    recordBackfillRun(db, run({ queue: "user_messages" }));
    recordBackfillRun(db, run({ queue: "group_messages", outcome: "incomplete", detail: "chạm trần trang" }));
    assert.deepEqual(backfillForGap(db, GAP_END), { status: "incomplete", items: 0, detail: "chạm trần trang" });
  });

  it("dừng dở rồi lần nối lại sau (trong cửa sổ) lấy bù xong: đã lấy bù đủ", () => {
    recordBackfillRun(db, run({ queue: "group_messages", outcome: "incomplete", detail: "mất kết nối giữa chừng" }));
    recordBackfillRun(db, run({ queue: "user_messages" }));
    recordBackfillRun(db, run({ queue: "group_messages", startedAt: at(3), items: 2 }));
    assert.equal(backfillForGap(db, GAP_END).status, "filled");
  });

  it("đăng nhập lại bằng QR (phiên mới): có thể thiếu dù lượt lấy bù trả hết", () => {
    recordNewSessionBackfill(db, at(-0.1));
    recordBackfillRun(db, run({ queue: "user_messages" }));
    recordBackfillRun(db, run({ queue: "group_messages" }));
    const r = backfillForGap(db, GAP_END);
    assert.equal(r.status, "incomplete");
    assert.match(r.detail ?? "", /QR/);
  });

  it("không có lượt lấy bù nào từ lúc nối lại (khoảng trước khi có bảng này): chưa rõ", () => {
    recordBackfillRun(db, run({ queue: "user_messages", startedAt: at(-60) }));
    recordBackfillRun(db, run({ queue: "group_messages", startedAt: at(-60) }));
    assert.equal(backfillForGap(db, GAP_END).status, "unknown");
  });

  it("lúc nối mạng yếu nên dừng dở, lần nối sau (vài giờ sau) mới lấy hết: tính là đã lấy bù đủ", () => {
    recordBackfillRun(db, run({ queue: "user_messages", outcome: "incomplete", detail: "Zalo không trả trang 1" }));
    recordBackfillRun(db, run({ queue: "group_messages" }));
    assert.equal(backfillForGap(db, GAP_END).status, "incomplete", "chưa có lượt nào xong cho tin 1-1");
    recordBackfillRun(db, run({ queue: "user_messages", startedAt: at(5 * 60), items: 120 }));
    assert.deepEqual(backfillForGap(db, GAP_END), { status: "filled", items: 120, detail: null });
  });

  it("lượt xong quá 7 ngày sau không tính", () => {
    recordBackfillRun(db, run({ queue: "group_messages" }));
    recordBackfillRun(db, run({ queue: "user_messages", startedAt: at(8 * 24 * 60) }));
    assert.equal(backfillForGap(db, GAP_END).status, "unknown");
  });

  it("trước khi lấy hết mà Zalo bỏ bớt phần cũ hay nick đăng nhập lại bằng QR: có thể thiếu; xảy ra sau đó thì không ảnh hưởng", () => {
    recordBackfillRun(db, run({ queue: "group_messages" }));
    recordBackfillRun(db, run({ queue: "user_messages", outcome: "incomplete", detail: "Zalo báo hàng chờ đã đầy và bỏ bớt phần cũ" }));
    recordBackfillRun(db, run({ queue: "user_messages", startedAt: at(60) }));
    assert.match(backfillForGap(db, GAP_END).detail ?? "", /bỏ bớt/);

    db = openArchiveDatabase(":memory:");
    recordBackfillRun(db, run({ queue: "group_messages" }));
    recordBackfillRun(db, run({ queue: "user_messages" }));
    recordNewSessionBackfill(db, at(60));
    assert.equal(backfillForGap(db, GAP_END).status, "filled", "đăng nhập lại sau khi đã lấy đủ");
  });

  it("chỉ có một hàng chờ tin: chưa rõ", () => {
    recordBackfillRun(db, run({ queue: "user_messages" }));
    assert.equal(backfillForGap(db, GAP_END).status, "unknown");
  });

  it("lượt lấy bù cảm xúc / sự kiện nhóm không tính vào tin", () => {
    recordBackfillRun(db, run({ queue: "user_messages" }));
    recordBackfillRun(db, run({ queue: "group_messages" }));
    recordBackfillRun(db, run({ queue: "group_reactions", outcome: "incomplete", detail: "Zalo không trả trang" }));
    assert.equal(backfillForGap(db, GAP_END).status, "filled");
  });
});
