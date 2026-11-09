import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { applyReaction } from "../storage/message-reaction-store.js";
import { recordRecall, upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { deleteMessagesFromArchive, previewMessageDeletion } from "./delete-messages-from-archive.js";

const AT = "2026-11-09T05:00:00.000Z";
type Db = ReturnType<typeof openArchiveDatabase>;

/**
 * Hội thoại u-lan: tin chữ (10:00), tin ảnh riêng (11:00, file aa 1000 byte), tin ảnh dùng chung file bb với tin của
 * u-binh (12:00, 500 byte). Thư mục media thật trên đĩa tạm để kiểm file có bị xóa không.
 */
function setup() {
  const db = openArchiveDatabase(":memory:");
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "kho-xoa-"));
  const add = (msgId: string, threadId: string, hour: string, photo: string | null) =>
    upsertMessage(
      db,
      sampleMessage({
        msgId,
        threadId,
        senderId: threadId,
        text: `tin ${msgId}`,
        sentAt: `2026-11-08T${hour}:00:00.000Z`,
        attachments: photo ? [{ kind: "photo", remoteUrl: `https://photo.zdn.vn/${msgId}-${photo}.jpg`, fileName: null, declaredSize: null }] : [],
      }),
      { source: "live", receivedAt: AT },
    );
  add("100", "u-lan", "10", null);
  add("101", "u-lan", "11", "aa");
  add("102", "u-lan", "12", "bb");
  add("200", "u-binh", "09", "bb");
  db.prepare("UPDATE attachments SET status = 'done', local_path = 'aa/aaaa.png', size_bytes = 1000 WHERE remote_url LIKE '%-aa.jpg'").run();
  db.prepare("UPDATE attachments SET status = 'done', local_path = 'bb/bbbb.png', size_bytes = 500 WHERE remote_url LIKE '%-bb.jpg'").run();
  for (const f of ["aa/aaaa.png", "aa/aaaa.jxl", "bb/bbbb.png"]) {
    fs.mkdirSync(path.join(mediaDir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(mediaDir, f), "x");
  }
  const idOf = (msgId: string) => (db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { db, mediaDir, idOf };
}

const msgIds = (db: Db) => (db.prepare("SELECT msg_id FROM messages ORDER BY msg_id").all() as Array<{ msg_id: string }>).map((r) => r.msg_id);
const lastAt = (db: Db, threadId: string) =>
  (db.prepare("SELECT last_message_at FROM threads WHERE thread_id = ?").get(threadId) as { last_message_at: string | null }).last_message_at;

describe("xóa tin khỏi kho từ dashboard", () => {
  it("xem trước: đếm tin + file sẽ mất; file còn tin khác dùng chung thì không tính", () => {
    const { db, idOf } = setup();
    assert.deepEqual(previewMessageDeletion(db, [idOf("101"), idOf("102"), 999_999]), { messages: 2, files: 1, bytes: 1000 });
    // Chọn cả hai tin dùng chung file bb thì file bb cũng mất
    assert.deepEqual(previewMessageDeletion(db, [idOf("102"), idOf("200")]), { messages: 2, files: 1, bytes: 500 });
    assert.deepEqual(previewMessageDeletion(db, [999_999]), { messages: 0, files: 0, bytes: 0 });
  });

  it("xóa tin + đính kèm + file trên ổ (cả bản đi kèm); file dùng chung giữ; danh sách hội thoại theo tin còn lại", () => {
    const { db, mediaDir, idOf } = setup();
    const r = deleteMessagesFromArchive(db, mediaDir, [idOf("101"), idOf("102")], AT);
    assert.deepEqual(r, { deleted: 2, filesRemoved: 2, bytes: 1000 });
    assert.deepEqual(msgIds(db), ["100", "200"]);
    assert.equal(fs.existsSync(path.join(mediaDir, "aa/aaaa.png")), false);
    assert.equal(fs.existsSync(path.join(mediaDir, "aa/aaaa.jxl")), false, "bản JXL gốc đi kèm cũng xóa");
    assert.equal(fs.existsSync(path.join(mediaDir, "bb/bbbb.png")), true, "tin của Bình còn dùng file bb");
    assert.equal(lastAt(db, "u-lan"), "2026-11-08T10:00:00.000Z");
    fs.rmSync(mediaDir, { recursive: true, force: true });
  });

  it("tin đã xóa không quay lại: đồng bộ điện thoại / lấy bù ghi lại tin, cảm xúc, thu hồi đều bị bỏ", () => {
    const { db, mediaDir, idOf } = setup();
    deleteMessagesFromArchive(db, mediaDir, [idOf("100")], AT);
    for (const source of ["mobile_sync", "old_messages", "live"] as const) {
      upsertMessage(db, sampleMessage({ msgId: "100", threadId: "u-lan", text: "tin 100" }), { source, receivedAt: AT });
    }
    applyReaction(db, { actionId: "r1", targetMsgIds: ["100"], reactorId: "u-lan", icon: "/-heart", reactedAt: AT, threadId: "u-lan", threadType: "user" });
    recordRecall(db, { msgId: "100", threadId: "u-lan", recalledBy: "u-lan", recalledAt: AT, rawJson: "{}" });
    assert.deepEqual(msgIds(db), ["101", "102", "200"]);
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE msg_id = '100'`).get() as { n: number }).n;
    assert.deepEqual([count("message_reaction_taps"), count("message_recalls")], [0, 0]);
    // Xóa hết tin của hội thoại: hội thoại rời danh sách
    deleteMessagesFromArchive(db, mediaDir, [idOf("101"), idOf("102")], AT);
    assert.equal(lastAt(db, "u-lan"), null);
    fs.rmSync(mediaDir, { recursive: true, force: true });
  });
});
