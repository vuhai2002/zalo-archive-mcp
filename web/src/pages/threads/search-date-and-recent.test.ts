import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRecent, pushRecent, type RecentThread } from "./recent-search-threads";
import { customRange, presetRange, shiftDate } from "./search-date-presets";

describe("bộ lọc Ngày gửi", () => {
  it("lùi ngày qua đầu tháng / đầu năm; 7 ngày qua gồm cả hôm nay", () => {
    assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftDate("2026-01-03", -6), "2025-12-28");
    assert.deepEqual(presetRange("today", "2026-10-30"), { from: "2026-10-30", to: "2026-10-30", label: "Hôm nay" });
    assert.deepEqual(presetRange("7d", "2026-10-30"), { from: "2026-10-24", to: "2026-10-30", label: "7 ngày qua" });
    assert.equal(presetRange("30d", "2026-10-30").from, "2026-10-01");
  });

  it("khoảng tự chọn: chọn ngược thì đảo lại; một ngày thì nhãn một ngày", () => {
    assert.deepEqual(customRange("2026-10-20", "2026-10-12"), { from: "2026-10-12", to: "2026-10-20", label: "12/10 - 20/10" });
    assert.equal(customRange("2026-10-12", "2026-10-12").label, "12/10");
  });
});

describe("Tìm gần đây", () => {
  const r = (threadId: string): RecentThread => ({ threadId, threadType: "user", name: threadId, avatarUrl: null });

  it("mở lại thì lên đầu, không trùng; giữ tối đa N mục", () => {
    assert.deepEqual(pushRecent([r("a"), r("b"), r("c")], r("b")).map((x) => x.threadId), ["b", "a", "c"]);
    assert.deepEqual(pushRecent([r("a"), r("b")], r("c"), 2).map((x) => x.threadId), ["c", "a"]);
  });

  it("dữ liệu lưu hỏng hay sai kiểu thì bỏ qua, không lỗi", () => {
    assert.deepEqual(parseRecent("không phải json"), []);
    assert.deepEqual(parseRecent('{"a":1}'), []);
    assert.deepEqual(parseRecent(JSON.stringify([r("a"), { threadId: 5 }, { ...r("b"), threadType: "kênh" }])), [r("a")]);
    assert.deepEqual(parseRecent(null), []);
  });
});
