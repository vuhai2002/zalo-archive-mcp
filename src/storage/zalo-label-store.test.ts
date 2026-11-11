import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openArchiveDatabase } from "./open-archive-database.js";
import { normalizeZaloLabels, parseLabelConversation, readZaloLabels, replaceZaloLabels } from "./zalo-label-store.js";

describe("thẻ Phân loại của Zalo", () => {
  it("mã hội thoại trong thẻ: 'g' + id là nhóm, id số trơn là người; mã lạ bỏ qua", () => {
    assert.deepEqual(parseLabelConversation("g2070000000000000113"), { threadId: "2070000000000000113", threadType: "group" });
    assert.deepEqual(parseLabelConversation("2010000000000000114"), { threadId: "2010000000000000114", threadType: "user" });
    for (const bad of ["", "gabc", "x123", null, undefined, {}]) assert.equal(parseLabelConversation(bad), null, String(bad));
  });

  it("chuẩn hóa dữ liệu Zalo trả: bỏ thẻ không tên, mã hội thoại lạ và trùng; màu chỉ nhận #rrggbb", () => {
    const labels = normalizeZaloLabels([
      { id: 3, text: " NHÃN THỬ B ", color: "#3A7BD5", emoji: "", conversations: ["g111", "222", "g111", "rác"], offset: 0 },
      { id: 4, text: "", conversations: ["g333"] },
      { id: 5, text: "Nhóm Sổ Tay Mẫu", color: "đỏ", emoji: "📚", conversations: null },
    ]);
    assert.deepEqual(labels, [
      {
        id: 3,
        name: "NHÃN THỬ B",
        color: "#3A7BD5",
        emoji: null,
        conversations: [
          { threadId: "111", threadType: "group" },
          { threadId: "222", threadType: "user" },
        ],
      },
      { id: 5, name: "Nhóm Sổ Tay Mẫu", color: null, emoji: "📚", conversations: [] },
    ]);
    assert.deepEqual(normalizeZaloLabels("không phải mảng"), []);
  });

  it("lưu cả bộ rồi đọc lại; chưa đồng bộ lần nào thì rỗng", () => {
    const db = openArchiveDatabase(":memory:");
    assert.deepEqual(readZaloLabels(db), { labels: [], syncedAt: null });
    const labels = normalizeZaloLabels([{ id: 1, text: "Nhãn thử nghiệm", conversations: ["g5"] }]);
    replaceZaloLabels(db, labels, new Date("2026-11-11T13:00:00.000Z"));
    assert.deepEqual(readZaloLabels(db), { labels, syncedAt: "2026-11-11T13:00:00.000Z" });
  });
});
