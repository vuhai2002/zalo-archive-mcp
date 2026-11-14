import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListenerGap } from "../../archive-api-types";
import { gapBackfillBadge, gapReason, isQuickGap, shortEventDetail, visibleConnectionEvents } from "./connection-panel-display";

const NOW = Date.parse("2026-10-31T05:00:00.000Z");
const gap = (from: string, to: string | null, extra: Partial<ListenerGap> = {}): ListenerGap => ({ from, to, closeCode: null, ...extra });

describe("mục kết nối ở Tổng quan", () => {
  it("khoảng dưới 2 phút đã nối lại là nối lại nhanh; dài hơn, chưa nối lại hay nghi mất tin thì liệt kê", () => {
    assert.equal(isQuickGap(gap("2026-10-30T09:16:00.000Z", "2026-10-30T09:17:10.000Z"), NOW), true);
    assert.equal(isQuickGap(gap("2026-10-30T09:16:00.000Z", "2026-10-30T09:18:00.000Z"), NOW), false);
    assert.equal(isQuickGap(gap("2026-10-31T04:59:30.000Z", null), NOW), false);
    assert.equal(isQuickGap(gap("2026-10-30T09:16:00.000Z", "2026-10-30T09:16:30.000Z", { suspected: true }), NOW), false);
  });

  it("lý do: nghi mất tin > chưa nối lại > máy ngủ > daemon tắt > mất mạng", () => {
    const labels = [
      gap("a", "b", { suspected: true, asleep: true }),
      gap("a", null, { daemonStopped: true }),
      gap("a", "b", { asleep: true, daemonStopped: true }),
      gap("a", "b", { daemonStopped: true }),
      gap("a", "b", { closeCode: 1006 }),
      gap("a", "b"),
    ].map((g) => gapReason(g).label);
    assert.deepEqual(labels, ["Nghi mất tin", "Chưa nối lại", "Máy ngủ", "Daemon tắt", "Mất mạng · mã 1006", "Mất kết nối"]);
  });

  it("bỏ 'Đăng nhập' khỏi danh sách sự kiện; ghi chú ghi bù dài thành câu ngắn", () => {
    const events = [
      { at: "3", kind: "connected", code: null, detail: null },
      { at: "2", kind: "login", code: null, detail: "uid 123" },
      { at: "1", kind: "closed", code: null, detail: "Tiến trình dừng đột ngột (ghi bù lúc khởi động lại)" },
    ];
    assert.deepEqual(visibleConnectionEvents(events).map((e) => e.kind), ["connected", "closed"]);
    assert.equal(shortEventDetail(events[2]!.detail), "Daemon tắt (tắt máy / khởi động lại)");
    assert.equal(shortEventDetail("Máy ngủ hoặc tiến trình bị treo (ghi bù khi chạy tiếp)"), "Máy ngủ / tiến trình bị treo");
    assert.equal(shortEventDetail("Nghe tiếp sau khi máy thức"), "Nghe tiếp sau khi máy thức");
    assert.equal(shortEventDetail(null), null);
  });

  it("nhãn lấy bù: đủ (kèm số tin), có thể thiếu (kèm lý do), chưa rõ; khoảng chưa gắn thì không có nhãn", () => {
    const filled = gapBackfillBadge(gap("a", "b", { backfill: "filled", backfillItems: 20, messagesInGap: 30 }));
    assert.deepEqual([filled?.label, filled?.tone], ["Đã lấy bù đủ · 30 tin", "green"]);
    const missing = gapBackfillBadge(gap("a", "b", { backfill: "incomplete", backfillDetail: "Chạm trần trang", messagesInGap: 3 }));
    assert.deepEqual([missing?.label, missing?.tone], ["Có thể thiếu tin", "amber"]);
    assert.match(missing?.title ?? "", /Chạm trần trang/);
    assert.match(missing?.title ?? "", /đồng bộ từ điện thoại/);
    assert.equal(gapBackfillBadge(gap("a", "b", { backfill: "unknown", messagesInGap: 0 }))?.label, "Chưa rõ đã lấy bù · 0 tin");
    assert.equal(gapBackfillBadge(gap("a", null)), null);
  });
});
