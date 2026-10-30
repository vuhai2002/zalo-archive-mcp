import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { replaceContactAliases } from "./contact-alias-store.js";
import { upsertContacts } from "./contact-store.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { firstUrlIn, threadMembers, threadSharedLinks } from "./thread-links-and-members-queries.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T03:00:00.000Z" };

describe("mục Link của bảng thông tin", () => {
  it("lấy link http(s) đầu tiên trong chữ, bỏ dấu câu dính cuối; link lạ thì không", () => {
    assert.deepEqual(firstUrlIn("xem https://www.forms.gle/Exampl, nhé"), { url: "https://www.forms.gle/Exampl", domain: "forms.gle" });
    assert.equal(firstUrlIn("javascript:alert(1) http//sai"), null);
  });

  it("link trong chữ của hội thoại, mới nhất trước; tin thu hồi và hội thoại khác không tính", () => {
    const db = openArchiveDatabase(":memory:");
    const add = (msgId: string, threadId: string, text: string, min: number) =>
      upsertMessage(db, sampleMessage({ msgId, cliMsgId: `c${msgId}`, threadId, senderId: threadId, text, sentAt: new Date(Date.UTC(2026, 9, 30, 1, min)).toISOString() }), live);
    add("1", "u-lan", "form đăng ký https://forms.gle/abc", 1);
    add("2", "u-lan", "không có link", 2);
    add("3", "u-lan", "tài liệu: https://docs.google.com/d/1", 3);
    add("4", "u-binh", "https://example.com", 4);
    const page = threadSharedLinks(db, { threadId: "u-lan", threadType: "user", limit: 10, offset: 0 });
    assert.equal(page.total, 2);
    assert.deepEqual(page.items.map((l) => [l.url, l.domain]), [
      ["https://docs.google.com/d/1", "docs.google.com"],
      ["https://forms.gle/abc", "forms.gle"],
    ]);
  });
});

describe("mục Thành viên của nhóm", () => {
  it("ai đã biết tên (tên gợi nhớ / danh bạ) đứng trước; tổng theo số Zalo báo; đánh dấu mình", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", threadId: "g-1", threadType: "group", senderId: "u-a", senderName: "A" }), live);
    db.prepare("INSERT INTO meta (key, value) VALUES ('self_uid', 'me')").run();
    db.prepare("UPDATE threads SET member_count = 25 WHERE thread_id = 'g-1'").run();
    const add = db.prepare("INSERT INTO group_members (group_id, user_id, position) VALUES ('g-1', ?, ?)");
    ["u-x", "u-a", "me", "u-b"].forEach((id, i) => add.run(id, i));
    upsertContacts(db, [{ userId: "u-b", displayName: "Bình", avatarUrl: null }]);
    replaceContactAliases(db, [{ userId: "u-a", alias: "Cô Út Ngạn" }]);
    const r = threadMembers(db, { groupId: "g-1", limit: 10, offset: 0 });
    assert.equal(r.total, 25);
    assert.deepEqual(r.members.map((m) => [m.userId, m.name, m.isSelf]), [
      ["u-a", "Cô Út Ngạn", false],
      ["u-b", "Bình", false],
      ["u-x", null, false],
      ["me", null, true],
    ]);
  });
});
