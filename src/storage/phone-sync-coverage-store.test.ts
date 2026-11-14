import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { openArchiveDatabase } from "./open-archive-database.js";
import { phoneSyncCovers, recordPhoneSyncCoverage } from "./phone-sync-coverage-store.js";

const ts = (iso: string) => Date.parse(iso);
const GAP = { from: "2026-03-10T07:00:00.000Z", to: "2026-03-10T09:00:00.000Z" };
const FINISHED = "2026-03-12T07:00:00.000Z";

let db = openArchiveDatabase(":memory:");
beforeEach(() => {
  db = openArchiveDatabase(":memory:");
});

describe("phủ của đồng bộ từ điện thoại", () => {
  it("đồng bộ một ngày phủ trọn khoảng trong ngày đó", () => {
    recordPhoneSyncCoverage(db, { fromTs: ts("2026-03-09T17:00:00.000Z"), toTs: ts("2026-03-10T16:59:59.999Z"), backupAt: FINISHED });
    assert.equal(phoneSyncCovers(db, GAP.from, GAP.to), true);
  });

  it("không giới hạn đầu = từ đầu lịch sử; không giới hạn cuối = tới lúc lấy bản sao lưu", () => {
    recordPhoneSyncCoverage(db, { fromTs: 0, toTs: 0, backupAt: FINISHED });
    assert.equal(phoneSyncCovers(db, GAP.from, GAP.to), true);
    assert.equal(phoneSyncCovers(db, "2026-03-12T08:00:00.000Z", "2026-03-12T09:00:00.000Z"), false, "sau lúc lấy bản sao lưu thì không phủ");
  });

  it("chỉ phủ một phần khoảng thì không tính", () => {
    recordPhoneSyncCoverage(db, { fromTs: ts("2026-03-10T08:00:00.000Z"), toTs: ts("2026-03-10T16:59:59.999Z"), backupAt: FINISHED });
    assert.equal(phoneSyncCovers(db, GAP.from, GAP.to), false);
  });

  it("chưa đồng bộ lần nào thì không phủ", () => {
    assert.equal(phoneSyncCovers(db, GAP.from, GAP.to), false);
  });
});
