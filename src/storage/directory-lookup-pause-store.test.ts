import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readLookupPause, saveLookupPause } from "./directory-lookup-pause-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("thời gian nghỉ hỏi danh bạ khi Zalo chặn", () => {
  it("lưu vào DB để chạy lại daemon vẫn nghỉ tiếp, không hỏi Zalo ngay", () => {
    const db = openArchiveDatabase(":memory:");
    assert.deepEqual(readLookupPause(db, "contacts"), { untilMs: 0, times: 0 });
    saveLookupPause(db, "contacts", { untilMs: 1_793_300_000_000, times: 2 });
    assert.deepEqual(readLookupPause(db, "contacts"), { untilMs: 1_793_300_000_000, times: 2 });
  });

  it("hỏi nhóm và hỏi hồ sơ nghỉ riêng; lệnh nghỉ cũ (trước khi tách) thuộc về hỏi hồ sơ", () => {
    const db = openArchiveDatabase(":memory:");
    db.prepare("INSERT INTO meta (key, value) VALUES ('directory_lookup_pause', ?)").run(JSON.stringify({ untilMs: 5, times: 3 }));
    assert.deepEqual(readLookupPause(db, "contacts"), { untilMs: 5, times: 3 });
    assert.deepEqual(readLookupPause(db, "groups"), { untilMs: 0, times: 0 });
    saveLookupPause(db, "groups", { untilMs: 9, times: 1 });
    assert.deepEqual(readLookupPause(db, "contacts"), { untilMs: 5, times: 3 });
  });

  it("giá trị hỏng (sửa tay) thì coi như không nghỉ", () => {
    const db = openArchiveDatabase(":memory:");
    db.prepare("INSERT INTO meta (key, value) VALUES ('directory_lookup_pause', '{hỏng')").run();
    assert.deepEqual(readLookupPause(db, "contacts"), { untilMs: 0, times: 0 });
  });
});
