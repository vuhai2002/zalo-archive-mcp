import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSearchToAdd, MAX_PRESENTATION_THREADS, parsePresentationState, withThreadAdded } from "./presentation-mode-state";

describe("chế độ trình chiếu", () => {
  it("đọc trạng thái đã lưu: hỏng hay rỗng thì tắt; id rác và trùng bị bỏ; không trình chiếu thì không nhớ danh sách", () => {
    assert.deepEqual(parsePresentationState(null), { active: false, threadIds: [] });
    assert.deepEqual(parsePresentationState("{hỏng"), { active: false, threadIds: [] });
    assert.deepEqual(parsePresentationState('{"active":true,"threadIds":["111","abc","111",5,"222"]}'), { active: true, threadIds: ["111", "222"] });
    assert.deepEqual(parsePresentationState('{"active":true,"threadIds":[]}'), { active: false, threadIds: [] });
    assert.deepEqual(parsePresentationState('{"active":"có","threadIds":["111"]}'), { active: false, threadIds: [] });
    assert.deepEqual(parsePresentationState('{"active":false,"threadIds":["111","222"]}'), { active: false, threadIds: [] }, "danh sách bản cũ để lại sau khi thoát");
    const many = JSON.stringify({ active: true, threadIds: Array.from({ length: 150 }, (_, i) => String(i + 1)) });
    assert.equal(parsePresentationState(many).threadIds.length, MAX_PRESENTATION_THREADS);
  });

  it("thêm hội thoại lúc đang trình chiếu: không trùng, đủ trần thì giữ nguyên", () => {
    const s = { active: true, threadIds: ["111"] };
    assert.deepEqual(withThreadAdded(s, "222"), { active: true, threadIds: ["111", "222"] });
    assert.equal(withThreadAdded(s, "111"), s);
    const full = { active: true, threadIds: Array.from({ length: MAX_PRESENTATION_THREADS }, (_, i) => String(i + 1)) };
    assert.equal(withThreadAdded(full, "999"), full);
  });

  it("ô tìm để thêm chỉ hỏi kho khi gõ từ 3 chữ (đếm sau khi bỏ khoảng trắng hai đầu)", () => {
    assert.equal(canSearchToAdd("Ng"), false);
    assert.equal(canSearchToAdd("  ab  "), false);
    assert.equal(canSearchToAdd("Ngọ"), true);
  });
});
