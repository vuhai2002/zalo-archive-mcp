import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { readThread, searchMessages } from "./message-read-queries.js";
import { recordRecall, upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { CLI_MSG_ID_TWIN_QUERY } from "./provisional-message-id-twin.js";

const ME = "u-me";
const at = (source: "live" | "old_messages" | "mobile_sync") => ({ source, receivedAt: "2026-10-29T08:00:00.000Z" });
// Cùng một tin mình gửi cho Lan: bản nghe trực tiếp có id thật, bản từ điện thoại chỉ có cliMsgId
const real = sampleMessage({
  msgId: "8400002000108",
  cliMsgId: "1700000000103",
  senderId: ME,
  isSelf: true,
  msgType: "chat.photo",
  text: "Ảnh bãi biển",
  sentAt: "2026-10-29T03:20:00.480Z",
  attachments: [{ kind: "photo", remoteUrl: "https://photo.zdn.vn/jpg/a.jpg", fileName: null, declaredSize: null }],
  rawJson: '{"msgId":"8400002000108"}',
});
const fromPhone = {
  ...real,
  msgId: "mb_1700000000103",
  sentAt: "2026-10-29T03:20:00.107Z",
  attachments: [{ kind: "photo" as const, remoteUrl: "https://photo.zdn.vn/jxl/a.jxl", fileName: null, declaredSize: null }],
  rawJson: '{"msgId":"mb_1700000000103"}',
};

function rows(db: ReturnType<typeof openArchiveDatabase>) {
  return db.prepare("SELECT id, msg_id, source, sent_at, raw_json FROM messages ORDER BY id").all() as Array<{
    id: number;
    msg_id: string;
    source: string;
    sent_at: string;
    raw_json: string;
  }>;
}
const urls = (db: ReturnType<typeof openArchiveDatabase>) =>
  (db.prepare("SELECT msg_id, remote_url FROM attachments ORDER BY id").all() as Array<{ msg_id: string; remote_url: string }>).map(
    (a) => [a.msg_id, a.remote_url],
  );

describe("tin id tạm từ điện thoại", () => {
  it("kho đã có bản id thật: bản từ điện thoại bị bỏ qua, không thêm tệp", () => {
    const db = openArchiveDatabase(":memory:");
    const first = upsertMessage(db, real, at("live"));
    const again = upsertMessage(db, fromPhone, at("mobile_sync"));
    assert.deepEqual(again, { id: first.id, inserted: false });
    assert.deepEqual(rows(db).map((r) => [r.msg_id, r.source]), [["8400002000108", "live"]]);
    assert.deepEqual(urls(db), [["8400002000108", "https://photo.zdn.vn/jpg/a.jpg"]]);
  });

  it("bản id tạm vào trước: bản thật tới sau nâng nó lên id thật, giữ nguồn đầu, thay tệp", () => {
    const db = openArchiveDatabase(":memory:");
    const first = upsertMessage(db, fromPhone, at("mobile_sync"));
    recordRecall(db, { msgId: real.msgId, threadId: real.threadId, recalledBy: ME, recalledAt: "2026-10-29T04:00:00.000Z", rawJson: "{}" });
    const again = upsertMessage(db, real, at("old_messages"));
    assert.deepEqual(again, { id: first.id, inserted: false });
    assert.deepEqual(
      rows(db).map((r) => [r.id, r.msg_id, r.source, r.sent_at, r.raw_json]),
      [[first.id, "8400002000108", "mobile_sync", real.sentAt, real.rawJson]],
    );
    assert.deepEqual(urls(db), [["8400002000108", "https://photo.zdn.vn/jpg/a.jpg"]]);
    assert.equal(searchMessages(db, { query: "bai bien", limit: 5 }).length, 1);
    // Lệnh thu hồi theo id thật khớp được sau khi nâng
    assert.equal(readThread(db, { threadId: real.threadId, threadType: "user", limit: 5 })[0]!.recalledAt, "2026-10-29T04:00:00.000Z");
  });

  it("không ghép nhầm: khác người gửi, hoặc hai id thật trùng cliMsgId, vẫn là hai tin", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, real, at("live"));
    upsertMessage(db, { ...fromPhone, senderId: "u-lan", isSelf: false }, at("mobile_sync"));
    upsertMessage(db, { ...real, msgId: "8400002000109" }, at("live"));
    assert.deepEqual(rows(db).map((r) => r.msg_id), ["8400002000108", "mb_1700000000103", "8400002000109"]);
  });

  it("dò bản trùng bằng chỉ mục hội thoại + cliMsgId, không quét hết tin của một người gửi", () => {
    const db = openArchiveDatabase(":memory:");
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${CLI_MSG_ID_TWIN_QUERY}`)
      .all("t", "c", "user", ME, "m")
      .map((r) => String((r as { detail: unknown }).detail))
      .join(" | ");
    assert.match(plan, /USING INDEX messages_thread_cli \(thread_id=\? AND cli_msg_id=\?\)/);
  });
});
