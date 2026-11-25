import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { replaceGroupMembers } from "../storage/group-member-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { upsertContacts } from "../storage/contact-store.js";
import { getAttachmentTool, readThreadTool } from "./archive-read-tool-handlers.js";
import { searchMessagesTool } from "./search-messages-tool.js";
import { listGroupMembersTool } from "./group-members-tool.js";

const env = parseEnv({});
const live = { source: "live" as const, receivedAt: "2026-11-09T05:00:00.000Z" };
const textOf = (r: { ok: boolean } & Record<string, unknown>) => JSON.stringify(r);

/** Nhóm g-1: 6 tin (Lan, Minh xen nhau), tin 5 trả lời tin 2, tin 4 có file báo giá */
function setup() {
  const db = openArchiveDatabase(":memory:");
  for (let i = 1; i <= 6; i++) {
    const lan = i % 2 === 0;
    upsertMessage(
      db,
      sampleMessage({
        msgId: `${700 + i}`,
        threadId: "g-1",
        threadType: "group",
        senderId: lan ? "101" : "102",
        senderName: lan ? "Lan" : "Minh",
        text: i === 4 ? "bao-gia-thang-11.pdf" : `tin số ${i}`,
        sentAt: `2026-11-09T0${i}:00:00.000Z`,
        quoteMsgId: i === 5 ? "702" : null,
        rawJson: i === 5 ? JSON.stringify({ quote: { ownerId: "101", msg: "tin số 2", fromD: "Lan" } }) : "{}",
        attachments: i === 4 ? [{ kind: "file", remoteUrl: "https://f.zdn.vn/bg.pdf", fileName: "bao-gia-thang-11.pdf", declaredSize: 9 }] : [],
      }),
      live,
    );
  }
  replaceGroupMembers(db, "g-1", ["101", "102", "103"], 3);
  upsertContacts(db, [{ userId: "103", displayName: "Quỳnh Diêu", avatarUrl: null }]);
  const idOf = (msgId: string) => (db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { ctx: { db, env, mediaRoot: "/media", accountId: "t" }, db, idOf };
}

describe("lệnh đọc cho Claude: điều hướng, lọc, thành viên nhóm", () => {
  it("read_thread: đoạn quanh một tin, tin mới hơn; dùng cùng lúc hai kiểu thì báo lỗi; tin gốc của tin trả lời ghi bằng số #N", () => {
    const s = setup();
    const around = textOf(readThreadTool(s.ctx, { thread_id: "g-1", around_id: s.idOf("704"), limit: 3 }));
    assert.ok(around.includes("tin số 3") && around.includes("bao-gia") && around.includes("trả lời tin #"), around);
    assert.ok(!around.includes("tin số 1"));
    const after = textOf(readThreadTool(s.ctx, { thread_id: "g-1", after_id: s.idOf("704") }));
    assert.ok(after.includes("tin số 5") && after.includes("tin số 6") && !after.includes("bao-gia"));
    assert.ok(after.includes(`trả lời tin #${s.idOf("702")} \\"tin số 2\\"`), after);
    // Gợi ý cách trả lời nằm NGOÀI khối dữ liệu, ở cuối kết quả: phiên Claude cũ (mô tả lệnh nạp trước khi có reply_to) vẫn thấy
    assert.match(after, /<\/zalo_data_[0-9a-f]{8}>[\s\S]*send_message hoặc send_file với reply_to = số #/);
    assert.equal(readThreadTool(s.ctx, { thread_id: "g-1", before_id: 9, after_id: 1 }).ok, false);
    assert.equal(readThreadTool(s.ctx, { thread_id: "g-1", around_id: 999_999 }).ok, false);
  });

  it("search_messages: theo người gửi, chỉ tin có file (tên file), không điều kiện thì báo lỗi", () => {
    const s = setup();
    const byLan = textOf(searchMessagesTool(s.ctx, { sender_id: "101", thread_id: "g-1" }));
    assert.ok(byLan.includes("tin số 2") && !byLan.includes("tin số 3"));
    const files = textOf(searchMessagesTool(s.ctx, { query: "bao gia", files_only: true }));
    assert.ok(files.includes("1 tin khớp") && files.includes("bao-gia-thang-11.pdf"), files);
    assert.ok(files.includes("reply_to = số #"), files);
    assert.equal(searchMessagesTool(s.ctx, {}).ok, false);
  });

  it("list_group_members lọc tên không dấu, kèm user_id để nhắc tên; get_attachment ghi tin bằng số #N", () => {
    const s = setup();
    const quynh = textOf(listGroupMembersTool(s.ctx, { thread_id: "g-1", query: "quynh" }));
    assert.ok(quynh.includes("Quỳnh Diêu | user_id=103") && quynh.includes("1 người khớp"), quynh);
    const att = (s.db.prepare("SELECT id FROM attachments LIMIT 1").get() as { id: number }).id;
    assert.ok(textOf(getAttachmentTool(s.ctx, { attachment_id: att })).includes(`Thuộc tin #${s.idOf("704")}`));
  });
});
