import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openArchiveDatabase } from "./open-archive-database.js";
import {
  dismissPhoneSyncSuggestion,
  readPhoneSyncSuggestion,
  settlePhoneSyncSuggestion,
  suggestPhoneSyncForGap,
} from "./phone-sync-suggestion-store.js";

const NOW = "2026-03-12T07:40:30.000Z";

describe("nhắc đồng bộ từ điện thoại sau khi đăng nhập lại bằng QR", () => {
  it("quãng không nghe dưới 10 phút thì không nhắc; dài hơn thì nhắc, gộp với quãng đang chờ", () => {
    const db = openArchiveDatabase(":memory:");
    assert.equal(suggestPhoneSyncForGap(db, "2026-03-12T07:33:00.000Z", NOW, NOW), false);
    assert.equal(readPhoneSyncSuggestion(db), null);
    assert.equal(suggestPhoneSyncForGap(db, "2026-03-12T03:20:10.000Z", NOW, NOW), true);
    suggestPhoneSyncForGap(db, "2026-03-13T01:00:00.000Z", "2026-03-13T02:00:00.000Z", NOW);
    assert.deepEqual(readPhoneSyncSuggestion(db), { fromIso: "2026-03-12T03:20:10.000Z", toIso: "2026-03-13T02:00:00.000Z", createdAt: NOW });
  });

  it("đồng bộ phủ hết quãng (hoặc toàn bộ lịch sử) thì thôi nhắc; phủ thiếu thì vẫn nhắc; bỏ qua thì thôi", () => {
    const db = openArchiveDatabase(":memory:");
    suggestPhoneSyncForGap(db, "2026-03-12T03:20:10.000Z", NOW, NOW);
    settlePhoneSyncSuggestion(db, { fromTs: Date.parse("2026-03-12T05:00:00.000Z"), toTs: 0 });
    assert.notEqual(readPhoneSyncSuggestion(db), null, "bắt đầu sau đầu quãng: chưa phủ hết");
    settlePhoneSyncSuggestion(db, { fromTs: Date.parse("2026-03-11T17:00:00.000Z"), toTs: Date.parse("2026-03-12T16:59:59.999Z") });
    assert.equal(readPhoneSyncSuggestion(db), null);

    suggestPhoneSyncForGap(db, "2026-03-12T03:20:10.000Z", NOW, NOW);
    settlePhoneSyncSuggestion(db, { fromTs: 0, toTs: 0 });
    assert.equal(readPhoneSyncSuggestion(db), null, "đồng bộ toàn bộ lịch sử");

    suggestPhoneSyncForGap(db, "2026-03-12T03:20:10.000Z", NOW, NOW);
    dismissPhoneSyncSuggestion(db);
    assert.equal(readPhoneSyncSuggestion(db), null);
  });
});
