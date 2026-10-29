import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readLookupPause, saveLookupPause } from "./directory-lookup-pause-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("thời gian nghỉ hỏi danh bạ khi Zalo chặn", () => {
  it("lưu vào DB để chạy lại daemon vẫn nghỉ tiếp, không hỏi Zalo ngay", () => {
    const db = openArchiveDatabase(":memory:");
    assert.deepEqual(readLookupPause(db), { untilMs: 0, times: 0 });
    saveLookupPause(db, { untilMs: 1_793_300_000_000, times: 2 });
    assert.deepEqual(readLookupPause(db), { untilMs: 1_793_300_000_000, times: 2 });
  });

  it("giá trị hỏng (sửa tay) thì coi như không nghỉ", () => {
    const db = openArchiveDatabase(":memory:");
    db.prepare("INSERT INTO meta (key, value) VALUES ('directory_lookup_pause', '{hỏng')").run();
    assert.deepEqual(readLookupPause(db), { untilMs: 0, times: 0 });
  });
});
