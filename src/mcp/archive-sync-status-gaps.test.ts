import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListenerGap } from "../storage/connection-event-store.js";
import { describeListenerGaps } from "./archive-sync-status-gaps.js";

const t = (iso: string | null) => (iso ? iso.slice(11, 16) : "?");
const gap = (o: Partial<ListenerGap>): ListenerGap => ({ from: "2026-03-10T07:00:00.000Z", to: "2026-03-10T09:00:00.000Z", closeCode: null, ...o });

describe("describeListenerGaps (sync_status)", () => {
  it("khoảng đã lấy bù đủ nói rõ, không còn câu 'có thể thiếu' chung chung", () => {
    const out = describeListenerGaps([gap({ asleep: true, backfill: "filled", backfillItems: 20, messagesInGap: 30 })], t, 7);
    assert.match(out, /ĐÃ LẤY BÙ ĐỦ/);
    assert.match(out, /Zalo gửi lại 20 tin/);
    assert.match(out, /kho có 30 tin trong khoảng này/);
    assert.doesNotMatch(out, /thường đã được Zalo gửi bù/);
  });

  it("khoảng có thể thiếu nêu lý do và cách lấy lại", () => {
    const out = describeListenerGaps([gap({ backfill: "incomplete", backfillDetail: "Chạm trần trang", messagesInGap: 3 })], t, 7);
    assert.match(out, /CÓ THỂ THIẾU TIN: Chạm trần trang/);
    assert.match(out, /đồng bộ từ điện thoại/);
  });

  it("khoảng chưa rõ (kèm cách làm cho chắc) và khoảng chưa nối lại", () => {
    const out = describeListenerGaps([gap({ backfill: "unknown", messagesInGap: 0 }), gap({ to: null })], t, 7);
    assert.match(out, /chưa rõ đã lấy bù đủ chưa/);
    assert.match(out, /đồng bộ từ điện thoại ngày đó/);
    assert.match(out, /HIỆN VẪN CHƯA NỐI LẠI/);
  });

  it("khoảng đã đồng bộ từ điện thoại", () => {
    const out = describeListenerGaps([gap({ backfill: "synced", messagesInGap: 7 })], t, 7);
    assert.match(out, /ĐÃ ĐỒNG BỘ TỪ ĐIỆN THOẠI \(kho có 7 tin trong khoảng này\)/);
    assert.match(out, /1 khoảng đã đồng bộ từ điện thoại/);
  });

  it("dòng tóm tắt đếm theo kết quả", () => {
    const out = describeListenerGaps(
      [gap({ backfill: "filled", backfillItems: 0, messagesInGap: 0 }), gap({ backfill: "incomplete", messagesInGap: 0 }), gap({ backfill: "unknown", messagesInGap: 0 })],
      t,
      7,
    );
    assert.match(out, /1 khoảng đã lấy bù đủ, 1 khoảng có thể thiếu tin, 1 khoảng chưa rõ/);
  });

  it("không có khoảng nào", () => {
    assert.match(describeListenerGaps([], t, 7), /Không có khoảng thủng nào/);
  });
});
