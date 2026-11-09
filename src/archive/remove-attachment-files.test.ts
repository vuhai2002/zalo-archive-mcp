import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { claimNextAttachment } from "../storage/attachment-queue-store.js";
import { failedAttachmentsForRecovery } from "../storage/attachment-local-recovery-store.js";
import { requestAttachmentRetry } from "../storage/attachment-renewal-store.js";
import { readThread } from "../storage/message-read-queries.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { previewRemoval, removeAttachmentFiles } from "./remove-attachment-files.js";

const AT = "2026-11-09T14:00:00.000Z";
type Db = ReturnType<typeof openArchiveDatabase>;

/**
 * Hội thoại u-lan: ảnh A (file aa, kèm bản HD aa.orig.jxl), video B (file bb, DÙNG CHUNG với tin của u-binh), sticker, ảnh tải
 * hỏng; hội thoại u-binh: ảnh dùng chung file bb. Thư mục media thật trên đĩa tạm.
 */
function setup() {
  const db = openArchiveDatabase(":memory:");
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "kho-don-"));
  const add = (msgId: string, threadId: string, text: string, kind: "photo" | "video" | "sticker" | "file", n = 1) =>
    upsertMessage(
      db,
      sampleMessage({
        msgId,
        threadId,
        senderId: threadId,
        text,
        sentAt: `2026-11-08T0${msgId.slice(-1)}:00:00.000Z`,
        attachments: Array.from({ length: n }, (_, i) => ({ kind, remoteUrl: `https://f.zdn.vn/${msgId}-${i}`, fileName: kind === "file" ? "bao-gia.pdf" : null, declaredSize: null })),
      }),
      { source: "live", receivedAt: AT },
    );
  add("101", "u-lan", "ảnh A", "photo");
  add("102", "u-lan", "video B", "video");
  add("103", "u-lan", "", "sticker");
  add("104", "u-lan", "ảnh hỏng", "photo");
  add("201", "u-binh", "cùng video", "video");
  const set = (msgId: string, sql: string) => db.prepare(`UPDATE attachments SET ${sql} WHERE msg_id = ?`).run(msgId);
  set("101", "status = 'done', local_path = 'aa/aaaa.png', size_bytes = 1000, sha256 = 'aaaa'");
  set("102", "status = 'done', local_path = 'bb/bbbb.mp4', size_bytes = 5000, sha256 = 'bbbb'");
  set("103", "status = 'done', local_path = 'cc/cccc.webp', size_bytes = 10");
  set("104", "status = 'failed', last_error = 'HTTP 404'");
  set("201", "status = 'done', local_path = 'bb/bbbb.mp4', size_bytes = 5000, sha256 = 'bbbb'");
  for (const [f, size] of [["aa/aaaa.png", 1000], ["aa/aaaa.orig.jxl", 3000], ["bb/bbbb.mp4", 5000], ["cc/cccc.webp", 10]] as const) {
    fs.mkdirSync(path.join(mediaDir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(mediaDir, f), Buffer.alloc(size));
  }
  const attOf = (msgId: string) => (db.prepare("SELECT id FROM attachments WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { db, mediaDir, attOf };
}

const statusOf = (db: Db, msgId: string) => ({
  ...(db.prepare("SELECT status, local_path, removed_at FROM attachments WHERE msg_id = ?").get(msgId) as {
    status: string;
    local_path: string | null;
    removed_at: string | null;
  }),
});
const exists = (dir: string, f: string) => fs.existsSync(path.join(dir, f));

describe("dọn dữ liệu: xóa file, giữ tin", () => {
  it("bảng đính kèm nhận trạng thái 'removed' + giờ xóa, đủ chỉ mục sau khi dựng lại", () => {
    const { db } = setup();
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'attachments'").all() as Array<{ name: string }>).map((r) => r.name);
    for (const name of ["attachments_queue", "attachments_fetched", "attachments_renew_ok", "attachments_local_path"]) assert.ok(idx.includes(name), name);
  });

  it("file riêng: xóa cả bản HD đi kèm, giải phóng đúng dung lượng trên ổ; tin + chữ vẫn còn, chỗ file thành 'removed'", () => {
    const s = setup();
    assert.deepEqual(previewRemoval(s.db, { attachmentIds: [s.attOf("101")] }), { files: 1, bytes: 1000, shared: 0 });
    assert.deepEqual(removeAttachmentFiles(s.db, s.mediaDir, { attachmentIds: [s.attOf("101")] }, AT), { removed: 1, filesDeleted: 2, bytes: 4000 });
    assert.equal(exists(s.mediaDir, "aa/aaaa.png") || exists(s.mediaDir, "aa/aaaa.orig.jxl"), false);
    assert.deepEqual(statusOf(s.db, "101"), { status: "removed", local_path: null, removed_at: AT });
    const msg = readThread(s.db, { threadId: "u-lan", threadType: "user", limit: 10 }).find((m) => m.msgId === "101")!;
    assert.equal(msg.text, "ảnh A");
    assert.equal(msg.attachments[0]!.status, "removed");
    fs.rmSync(s.mediaDir, { recursive: true, force: true });
  });

  it("file dùng chung với tin khác: tin này thành 'đã xóa file' nhưng file trên ổ giữ cho tin kia; xóa cả hai thì mới xóa file", () => {
    const s = setup();
    assert.deepEqual(previewRemoval(s.db, { attachmentIds: [s.attOf("102")] }), { files: 1, bytes: 0, shared: 1 });
    assert.deepEqual(removeAttachmentFiles(s.db, s.mediaDir, { attachmentIds: [s.attOf("102")] }, AT), { removed: 1, filesDeleted: 0, bytes: 0 });
    assert.equal(exists(s.mediaDir, "bb/bbbb.mp4"), true);
    assert.equal(statusOf(s.db, "201").status, "done");
    assert.deepEqual(removeAttachmentFiles(s.db, s.mediaDir, { attachmentIds: [s.attOf("201")] }, AT), { removed: 1, filesDeleted: 1, bytes: 5000 });
    assert.equal(exists(s.mediaDir, "bb/bbbb.mp4"), false);
    fs.rmSync(s.mediaDir, { recursive: true, force: true });
  });

  it("họ file cùng tên sha: còn đính kèm khác dùng bản .jxl thì không xóa bản .png (xóa là xóa cả họ)", () => {
    const s = setup();
    s.db.prepare("UPDATE attachments SET status = 'done', local_path = 'aa/aaaa.orig.jxl', size_bytes = 3000 WHERE msg_id = '104'").run();
    assert.deepEqual(previewRemoval(s.db, { attachmentIds: [s.attOf("101")] }), { files: 1, bytes: 0, shared: 1 });
    assert.equal(removeAttachmentFiles(s.db, s.mediaDir, { attachmentIds: [s.attOf("101")] }, AT).filesDeleted, 0);
    assert.equal(exists(s.mediaDir, "aa/aaaa.png"), true);
    fs.rmSync(s.mediaDir, { recursive: true, force: true });
  });

  it("xóa cả hội thoại: mọi file đã tải trừ sticker; file hỏng, sticker, hội thoại khác không đụng", () => {
    const s = setup();
    const r = removeAttachmentFiles(s.db, s.mediaDir, { threadIds: ["u-lan"] }, AT);
    assert.equal(r.removed, 2);
    assert.deepEqual(["101", "102", "103", "104", "201"].map((m) => statusOf(s.db, m).status), ["removed", "removed", "done", "failed", "done"]);
    fs.rmSync(s.mediaDir, { recursive: true, force: true });
  });

  it("file đã xóa không quay lại: không vào hàng tải, không xin lại link, không lấy từ Zalo PC, đồng bộ lại tin không thêm đính kèm", () => {
    const s = setup();
    removeAttachmentFiles(s.db, s.mediaDir, { attachmentIds: [s.attOf("101")] }, AT);
    // Hàng tải chỉ lấy 'pending'; xin lại link chỉ nhận 'failed'; lấy từ Zalo PC chỉ nhận 'failed'
    assert.equal(claimNextAttachment(s.db, "2030-01-01T00:00:00.000Z"), null);
    assert.equal(requestAttachmentRetry(s.db, s.attOf("101"), AT), false);
    assert.ok(!failedAttachmentsForRecovery(s.db).some((c) => c.msgId === "101"));
    // Đồng bộ điện thoại ghi lại đúng tin đó (link khác): không thêm đính kèm mới
    upsertMessage(
      s.db,
      sampleMessage({ msgId: "101", threadId: "u-lan", senderId: "u-lan", text: "ảnh A", attachments: [{ kind: "photo", remoteUrl: "https://khac.zdn.vn/x", fileName: null, declaredSize: null }] }),
      { source: "mobile_sync", receivedAt: AT },
    );
    const rows = s.db.prepare("SELECT status FROM attachments WHERE msg_id = '101'").all() as Array<{ status: string }>;
    assert.deepEqual(rows.map((r) => r.status), ["removed"]);
    fs.rmSync(s.mediaDir, { recursive: true, force: true });
  });
});
