import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SendSettings } from "../../archive-api-types";
import { changedFields, toDraft, validateDraft } from "./send-settings-fields";

const SAVED: SendSettings = {
  singleMinGapSeconds: 3,
  batchMinGapSeconds: 45,
  batchMaxGapSeconds: 180,
  batchWindowStartHour: 7,
  batchWindowEndHour: 22,
  batchDailyCap: 100,
  batchMaxItems: 50,
  maxLatenessHours: 12,
};

describe("validateDraft", () => {
  it("form chưa sửa thì hợp lệ và parse lại đúng số", () => {
    const r = validateDraft(toDraft(SAVED));
    assert.deepEqual(r.errors, {});
    assert.deepEqual(r.values, SAVED);
  });

  it("báo lỗi ô rỗng, số lẻ, ngoài khoảng", () => {
    const r = validateDraft({ ...toDraft(SAVED), singleMinGapSeconds: "", batchDailyCap: "1.5", batchMaxItems: "0" });
    assert.equal(r.values, null);
    assert.ok(r.errors.singleMinGapSeconds);
    assert.ok(r.errors.batchDailyCap);
    assert.ok(r.errors.batchMaxItems);
  });

  it("nhịp ngắn nhất lớn hơn dài nhất là lỗi", () => {
    const r = validateDraft({ ...toDraft(SAVED), batchMinGapSeconds: "200", batchMaxGapSeconds: "100" });
    assert.ok(r.errors.batchMaxGapSeconds);
  });

  it("giờ kết thúc khung lô phải sau giờ bắt đầu", () => {
    const r = validateDraft({ ...toDraft(SAVED), batchWindowStartHour: "22", batchWindowEndHour: "22" });
    assert.ok(r.errors.batchWindowEndHour);
  });
});

describe("changedFields", () => {
  it("chỉ gửi các ô đã đổi", () => {
    assert.deepEqual(changedFields(SAVED, { ...SAVED, batchDailyCap: 20 }), { batchDailyCap: 20 });
    assert.deepEqual(changedFields(SAVED, SAVED), {});
  });
});
