import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { recordAttachmentRenewed } from "./attachment-renewal-store.js";
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

  it("tin đã có ảnh tới lại với link khác của cùng ảnh (bản sao lưu điện thoại ghi .jxl) thì không thêm đính kèm", () => {
    const db = openArchiveDatabase(":memory:");
    const photo = (remoteUrl: string) =>
      sampleMessage({ msgType: "chat.photo", attachments: [{ kind: "photo", remoteUrl, fileName: null, declaredSize: null }] });
    upsertMessage(db, photo("https://f119-zpc.zdn.vn/jpg/71/4f83.jpg"), live);
    upsertMessage(db, photo("https://f119-zpc.zdn.vn/jxl/71/4f83.jxl"), {
      source: "mobile_sync",
      receivedAt: "2026-10-29T08:00:00.000Z",
    });
    const rows = db.prepare("SELECT remote_url FROM attachments").all() as Array<{ remote_url: string }>;
    assert.deepEqual(rows.map((r) => r.remote_url), ["https://f119-zpc.zdn.vn/jpg/71/4f83.jpg"]);
  });

  it("đính kèm đã được cấp link mới: tin tới lại mang link gốc không sinh dòng thứ hai", () => {
    const db = openArchiveDatabase(":memory:");
    const msg = sampleMessage({
      attachments: [{ kind: "file", remoteUrl: "https://f1.zdn.vn/goc.pdf", fileName: "a.pdf", declaredSize: 10 }],
    });
    upsertMessage(db, msg, live);
    const { id } = db.prepare("SELECT id FROM attachments").get() as { id: number };
    recordAttachmentRenewed(db, id, "https://f1.zdn.vn/moi.pdf", "2026-10-29T09:00:00.000Z");
    upsertMessage(db, msg, { source: "old_messages", receivedAt: "2026-10-29T09:30:00.000Z" });
    const rows = db.prepare("SELECT id, remote_url FROM attachments").all() as Array<{ id: number; remote_url: string }>;
    assert.deepEqual(rows.map((r) => [r.id, r.remote_url]), [[id, "https://f1.zdn.vn/moi.pdf"]]);
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
