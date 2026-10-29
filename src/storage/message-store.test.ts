import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { findThread, listThreads, readThread, searchMessages } from "./message-read-queries.js";
import { recordRecall, upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { replaceFriendDirectory, upsertGroupNames } from "./thread-directory-store.js";

const live = { source: "live" as const, receivedAt: "2026-10-28T03:00:01.000Z" };

describe("message store", () => {
  it("khử trùng theo msg_id: lần hai cập nhật cột suy ra nhưng giữ source của lần đầu", () => {
    const db = openArchiveDatabase(":memory:");
    const first = upsertMessage(db, sampleMessage(), live);
    const again = upsertMessage(db, sampleMessage({ text: "Chào anh (sửa parser)" }), {
      source: "old_messages",
      receivedAt: "2026-10-28T05:00:00.000Z",
    });
    assert.equal(first.inserted, true);
    assert.equal(again.inserted, false);
    assert.equal(again.id, first.id);
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.text, "Chào anh (sửa parser)");
    assert.equal(rows[0]!.source, "live");
    // FTS cũng phải theo nội dung mới, không còn bản cũ
    assert.equal(searchMessages(db, { query: "sua parser", limit: 10 }).length, 1);
  });

  it("tìm kiếm bỏ dấu cả chữ đ, cả hai chiều", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", text: "Mai đi Bàu Lý nhé" }), live);
    upsertMessage(db, sampleMessage({ msgId: "2", text: "khong lien quan" }), live);
    assert.deepEqual(
      searchMessages(db, { query: "bau ly", limit: 10 }).map((m) => m.msgId),
      ["1"],
    );
    assert.deepEqual(
      searchMessages(db, { query: "ĐI", limit: 10 }).map((m) => m.msgId),
      ["1"],
    );
    // Ký tự cú pháp FTS5 không làm câu lệnh hỏng
    assert.deepEqual(searchMessages(db, { query: 'NEAR(" * :', limit: 10 }), []);
  });

  it("thu hồi tới SAU tin gốc và tới TRƯỚC tin gốc đều được đánh dấu", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "10" }), live);
    const recall = (msgId: string) => ({
      msgId,
      threadId: "u-lan",
      recalledBy: "u-lan",
      recalledAt: "2026-10-28T04:00:00.000Z",
      rawJson: "{}",
    });
    recordRecall(db, recall("10"));
    recordRecall(db, recall("11"));
    upsertMessage(db, sampleMessage({ msgId: "11" }), live);
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.deepEqual(
      rows.map((r) => [r.msgId, r.recalledAt]),
      [
        ["10", "2026-10-28T04:00:00.000Z"],
        ["11", "2026-10-28T04:00:00.000Z"],
      ],
    );
  });

  it("đọc hội thoại theo thời gian, phân trang lùi bằng beforeId", () => {
    const db = openArchiveDatabase(":memory:");
    for (let i = 1; i <= 5; i++) {
      upsertMessage(db, sampleMessage({ msgId: String(i), sentAt: `2026-10-28T0${i}:00:00.000Z` }), live);
    }
    const page1 = readThread(db, { threadId: "u-lan", threadType: "user", limit: 2 });
    assert.deepEqual(page1.map((m) => m.msgId), ["4", "5"]);
    const page2 = readThread(db, { threadId: "u-lan", threadType: "user", limit: 2, beforeId: page1[0]!.id });
    assert.deepEqual(page2.map((m) => m.msgId), ["2", "3"]);
  });

  it("đính kèm đi theo tin, không nhân đôi khi ghi lại", () => {
    const db = openArchiveDatabase(":memory:");
    const msg = sampleMessage({
      attachments: [{ kind: "file", remoteUrl: "https://f1.zdn.vn/a.pdf", fileName: "hợp đồng.pdf", declaredSize: 10 }],
    });
    upsertMessage(db, msg, live);
    upsertMessage(db, msg, live);
    const [row] = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.equal(row!.attachments.length, 1);
    assert.equal(row!.attachments[0]!.status, "pending");
    assert.equal(searchMessages(db, { query: "hop dong", limit: 5 }).length, 1);
  });

  it("tên hội thoại: tên danh bạ đè tên lấy từ tin; danh sách bạn rỗng bị bỏ qua", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ senderName: "Lan tên hiển thị" }), live);
    assert.equal(findThread(db, "u-lan")?.name, "Lan tên hiển thị");
    replaceFriendDirectory(db, [{ threadId: "u-lan", name: "Lan (bạn cũ)" }]);
    assert.equal(findThread(db, "u-lan")?.name, "Lan (bạn cũ)");
    assert.equal(findThread(db, "u-lan")?.isFriend, true);
    assert.equal(replaceFriendDirectory(db, []), 0);
    assert.equal(findThread(db, "u-lan")?.isFriend, true);
    upsertGroupNames(db, [{ threadId: "g-1", name: "Nhà Lư mình" }]);
    assert.deepEqual(
      listThreads(db, { query: "nha lu minh", limit: 5 }).map((t) => t.threadId),
      ["g-1"],
    );
  });
});
