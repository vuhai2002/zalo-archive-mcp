import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ingestArchiveEvent } from "../archive/archive-event-ingestor.js";
import { appendJournal } from "../archive/raw-event-journal.js";
import { applyPastMyDocumentsDeletes } from "../daemon/my-documents-past-deletes-backfill.js";
import { removeOrphanMediaFiles } from "../media/remove-orphan-media-files.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { upsertMessage } from "./message-write-store.js";
import { MY_DOCUMENTS_META_KEY } from "./my-documents-deletion-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { findThread, searchMessages } from "./message-read-queries.js";
import { setMeta } from "./thread-directory-store.js";

const ME = "u-me";
const DOCS = "210000000000000115";
const AT = new Date("2026-03-04T08:20:00.000Z");
const log = createSilentLogger();
type Db = ReturnType<typeof openArchiveDatabase>;

/** Kho có My Documents (2 tin, 1 tin kèm ảnh) và một hội thoại thường dùng chung file ảnh đó */
function setup() {
  const db = openArchiveDatabase(":memory:");
  setMeta(db, MY_DOCUMENTS_META_KEY, DOCS);
  const mine = (msgId: string, text: string, photo: string | null = null) =>
    upsertMessage(
      db,
      sampleMessage({
        msgId,
        cliMsgId: `c${msgId}`,
        threadId: DOCS,
        senderId: ME,
        isSelf: true,
        text,
        attachments: photo ? [{ kind: "photo", remoteUrl: `https://photo.zdn.vn/${photo}.jpg`, fileName: null, declaredSize: null }] : [],
      }),
      { source: "live", receivedAt: AT.toISOString() },
    );
  mine("8400013000115", "bản nháp chữ sai", "a");
  mine("8400013000116", "bản gửi lại đúng", "b");
  upsertMessage(
    db,
    sampleMessage({ msgId: "9000", threadId: "u-lan", text: "ảnh gửi Lan", attachments: [{ kind: "photo", remoteUrl: "https://photo.zdn.vn/b2.jpg", fileName: null, declaredSize: null }] }),
    { source: "live", receivedAt: AT.toISOString() },
  );
  db.prepare("UPDATE attachments SET status = 'done', local_path = 'aa/aaaa.png' WHERE remote_url LIKE '%/a.jpg'").run();
  db.prepare("UPDATE attachments SET status = 'done', local_path = 'bb/bbbb.png' WHERE remote_url LIKE '%/b%.jpg'").run();
  return db;
}

/** Lệnh "xóa ở phía tôi" như Zalo gửi (actionType 0 = mình xóa; 1 = trưởng nhóm xóa tin thành viên) */
const deleteCommand = (threadId: string, msgId: string, actionType = 0) => ({
  threadType: "user" as const,
  threadId,
  isSelf: true,
  data: {
    msgId: `d${msgId}`,
    msgType: "chat.delete",
    uidFrom: ME,
    ts: String(AT.getTime()),
    content: [{ type: 1, actionType, uidFrom: ME, uidTo: threadId, clientDelMsgId: 1, globalDelMsgId: Number(msgId), destId: threadId }],
  },
});
const msgIds = (db: Db) => (db.prepare("SELECT msg_id FROM messages ORDER BY id").all() as Array<{ msg_id: string }>).map((r) => r.msg_id);

describe("My Documents: tin bạn xóa thì kho xóa hẳn", () => {
  it("xóa tin + đính kèm + chỉ mục tìm kiếm; file dùng chung với hội thoại khác thì giữ", () => {
    const db = setup();
    const stats = ingestArchiveEvent(db, { kind: "message", message: deleteCommand(DOCS, "8400013000115") }, AT, log);
    assert.deepEqual([stats.deleted, stats.orphanFiles], [1, ["aa/aaaa.png"]]);
    assert.deepEqual(msgIds(db), ["8400013000116", "9000"]);
    assert.equal(searchMessages(db, { query: "chu sai", limit: 5 }).length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE msg_id = '8400013000115'").get()?.n, 0);

    const shared = ingestArchiveEvent(db, { kind: "old_messages", messages: [deleteCommand(DOCS, "8400013000116")] }, AT, log);
    assert.deepEqual([shared.deleted, shared.orphanFiles], [1, []], "file bb còn tin của Lan dùng");
  });

  it("hội thoại khác, hoặc lệnh trưởng nhóm xóa tin thành viên: kho vẫn giữ tin", () => {
    const db = setup();
    ingestArchiveEvent(db, { kind: "message", message: deleteCommand("u-lan", "9000") }, AT, log);
    ingestArchiveEvent(db, { kind: "message", message: deleteCommand(DOCS, "8400013000115", 1) }, AT, log);
    assert.deepEqual(msgIds(db), ["8400013000115", "8400013000116", "9000"]);
  });

  it("dashboard biết hội thoại nào là My Documents (không hiện 'Người lạ')", () => {
    const db = setup();
    assert.equal(findThread(db, DOCS)?.isMyDocuments, true);
    assert.equal(findThread(db, "u-lan")?.isMyDocuments, false);
  });

  it("tin đã xóa không vào lại kho qua lấy bù / đồng bộ điện thoại", () => {
    const db = setup();
    ingestArchiveEvent(db, { kind: "message", message: deleteCommand(DOCS, "8400013000115") }, AT, log);
    const again = upsertMessage(db, sampleMessage({ msgId: "8400013000115", threadId: DOCS, text: "bản nháp chữ sai" }), { source: "old_messages", receivedAt: AT.toISOString() });
    assert.deepEqual(again, { id: 0, inserted: false });
    assert.deepEqual(msgIds(db), ["8400013000116", "9000"]);
  });

  it("lệnh xóa cũ trong nhật ký được áp dụng một lần lúc khởi động", async () => {
    const db = setup();
    const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-docs-journal-"));
    appendJournal(journalDir, { at: AT.toISOString(), event: "message", payload: { kind: "message", message: deleteCommand(DOCS, "8400013000115") } });
    const opts = { db, journalDir, mediaDir: path.join(journalDir, "media"), log };
    assert.equal(await applyPastMyDocumentsDeletes(opts), 1);
    assert.deepEqual(msgIds(db), ["8400013000116", "9000"]);
    assert.equal(await applyPastMyDocumentsDeletes(opts), 0, "đã làm rồi thì thôi");
  });

  it("xóa file media không còn dùng cùng bản gốc đi kèm (cùng tên sha); đường dẫn ra ngoài thì bỏ qua", () => {
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-docs-media-"));
    fs.mkdirSync(path.join(mediaDir, "aa"));
    for (const f of ["aaaa.png", "aaaa.jxl", "aaaa.orig.jpg", "aaab.png"]) fs.writeFileSync(path.join(mediaDir, "aa", f), "x");
    const outside = path.join(path.dirname(mediaDir), `${path.basename(mediaDir)}-outside.txt`);
    fs.writeFileSync(outside, "x");
    assert.equal(removeOrphanMediaFiles(mediaDir, ["aa/aaaa.png", `../${path.basename(outside)}`]), 3);
    assert.deepEqual(fs.readdirSync(path.join(mediaDir, "aa")), ["aaab.png"]);
    assert.equal(fs.existsSync(outside), true);
  });
});
