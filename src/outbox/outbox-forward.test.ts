import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { listThreadsPage } from "../storage/thread-list-queries.js";
import { replaceFriendDirectory } from "../storage/thread-directory-store.js";
import { getOutboxItem, listOutbox } from "../storage/outbox-store.js";
import { enqueueForward, MAX_FORWARD_TARGETS } from "./enqueue-forward-request.js";
import { OutboxSender } from "./outbox-sender-loop.js";
import { forwardedMsgId } from "./outbox-zalo-message-content.js";

const env = parseEnv({});
const NOW = new Date("2026-11-09T03:00:00.000Z");
const live = { source: "live" as const, receivedAt: NOW.toISOString() };
const LINK = { action: "recommened.link", title: "xem bài này https://help.example.vn/kb/x", href: "https://help.example.vn/kb/x" };

/** u-lan (bạn bè): tin chữ, tin chữ dài { title }, tin link, ảnh, tin đã thu hồi; nhóm g-1; u-la (người lạ) */
function setup() {
  const db = openArchiveDatabase(":memory:");
  const add = (msgId: string, o: Parameters<typeof sampleMessage>[0]) => upsertMessage(db, sampleMessage({ msgId, ...o }), live);
  add("1", { text: "Nhắc cả nhóm nộp báo cáo tuần", rawJson: JSON.stringify({ content: "Nhắc cả nhóm nộp báo cáo tuần" }) });
  add("2", { text: "Thông báo dài", rawJson: JSON.stringify({ content: { title: "Thông báo dài\nnhiều dòng" } }) });
  add("3", { msgType: "chat.recommended", text: LINK.title, rawJson: JSON.stringify({ content: LINK }) });
  add("4", { msgType: "chat.photo", text: "", rawJson: "{}" });
  add("5", { text: "đã thu hồi", rawJson: "{}" });
  db.prepare("UPDATE messages SET recalled_at = ? WHERE msg_id = '5'").run(NOW.toISOString());
  add("6", { threadId: "g-1", threadType: "group", senderId: "u-x", text: "chào nhóm" });
  add("7", { threadId: "u-la", senderId: "u-la", text: "người lạ" });
  replaceFriendDirectory(db, [{ threadId: "u-lan", name: "Lan" }]);
  const idOf = (msgId: string) => (db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { db, ctx: { db, env, readOnly: false, now: () => NOW }, idOf };
}

const fwd = (s: ReturnType<typeof setup>, msgId: string, threadIds: string[], note?: string) =>
  enqueueForward(s.ctx, { messageId: s.idOf(msgId), threadIds, note, createdBy: "dashboard" });

describe("chuyển tiếp (Chia sẻ) một tin tới nhiều hội thoại", () => {
  it("mỗi nơi một mục hàng đợi cùng mã nhóm, lời nhắn đi ngay sau tin chuyển tiếp; bạn bè, nhóm, người lạ đều được", () => {
    const s = setup();
    const r = fwd(s, "1", ["u-lan", "g-1", "u-la", "u-lan"], "  nhờ mọi người xem  ");
    assert.equal(r.ok, true);
    const items = listOutbox(s.db, { limit: 20 }).reverse();
    assert.deepEqual(
      items.map((i) => [i.threadId, i.text, i.forwardOf, i.status, i.mode]),
      [
        ["u-lan", "Nhắc cả nhóm nộp báo cáo tuần", s.idOf("1"), "approved", "single"],
        ["u-lan", "nhờ mọi người xem", null, "approved", "single"],
        ["g-1", "Nhắc cả nhóm nộp báo cáo tuần", s.idOf("1"), "approved", "single"],
        ["g-1", "nhờ mọi người xem", null, "approved", "single"],
        ["u-la", "Nhắc cả nhóm nộp báo cáo tuần", s.idOf("1"), "approved", "single"],
        ["u-la", "nhờ mọi người xem", null, "approved", "single"],
      ],
    );
    assert.equal(new Set(items.map((i) => i.batchId)).size, 1);
    assert.equal(items[2]!.threadType, "group");
  });

  it("tin chữ dài lấy đúng chữ gốc; tin link chuyển tiếp chữ của tin (chứa link); không lời nhắn thì chỉ một mục mỗi nơi", () => {
    const s = setup();
    fwd(s, "2", ["g-1"]);
    fwd(s, "3", ["g-1"]);
    assert.deepEqual(
      listOutbox(s.db, { limit: 5 }).map((i) => i.text),
      [LINK.title, "Thông báo dài\nnhiều dòng"],
    );
  });

  it("từ chối và không tạo mục nào: ảnh, tin đã thu hồi, quá 100 nơi, hội thoại lạ, chưa chọn ai, nick Chỉ đọc", () => {
    const s = setup();
    const err = (r: ReturnType<typeof fwd>) => (r.ok ? "" : r.error);
    assert.match(err(fwd(s, "4", ["u-lan"])), /chỉ chuyển tiếp được tin chữ và link/);
    assert.match(err(fwd(s, "5", ["u-lan"])), /thu hồi/);
    const many = Array.from({ length: MAX_FORWARD_TARGETS + 1 }, (_, i) => `u-${i}`);
    assert.match(err(fwd(s, "1", many)), /tối đa 100/);
    assert.match(err(fwd(s, "1", ["u-lan", "u-khong-co"])), /Không thấy hội thoại thread_id=u-khong-co/);
    assert.match(err(fwd(s, "1", [])), /Chưa chọn/);
    const ro = enqueueForward({ ...s.ctx, readOnly: true }, { messageId: s.idOf("1"), threadIds: ["u-lan"], createdBy: "dashboard" });
    assert.match(err(ro), /Chỉ đọc/);
    assert.equal(listOutbox(s.db, { limit: 5 }).length, 0);
  });

  it("daemon: tin chuyển tiếp đi bằng API chuyển tiếp, lời nhắn bằng tin chữ thường; cả hai không giả đang soạn", async () => {
    const s = setup();
    fwd(s, "1", ["g-1"], "xem nhé");
    const calls: string[] = [];
    let clock = NOW;
    const sender = new OutboxSender({
      db: s.db,
      env,
      log: createSilentLogger(),
      sendText: async (threadId, _t, text) => {
        calls.push(`gửi ${threadId}: ${text}`);
        return { msgId: "901" };
      },
      forwardText: async (threadId, _t, text) => {
        calls.push(`chuyển tiếp ${threadId}: ${text}`);
        return { msgId: "900" };
      },
      sendTyping: async (threadId) => void calls.push(`đang soạn ${threadId}`),
      sleep: async () => {},
      isListenerConnected: () => true,
      isReadOnly: () => false,
      now: () => clock,
      random: () => 0,
    });
    await sender.tick();
    clock = new Date(clock.getTime() + 10_000);
    await sender.tick();
    // Lời nhắn do người dùng tự gõ trên dashboard: đi ngay, không giả "đang soạn"
    assert.deepEqual(calls, ["chuyển tiếp g-1: Nhắc cả nhóm nộp báo cáo tuần", "gửi g-1: xem nhé"]);
    assert.deepEqual([getOutboxItem(s.db, 1)!.sentMsgId, getOutboxItem(s.db, 2)!.sentMsgId], ["900", "901"]);
  });

  it("đọc kết quả API chuyển tiếp: Zalo báo lỗi trong `fail` thì ném lỗi; thành công lấy mã tin", () => {
    assert.deepEqual(forwardedMsgId({ success: [{ clientId: "1", msgId: "8470" }], fail: [] }), { msgId: "8470" });
    assert.throws(() => forwardedMsgId({ success: [], fail: [{ clientId: "1", error_code: "114" }] }), /mã lỗi 114/);
    assert.deepEqual(forwardedMsgId({ success: [], fail: [] }), { msgId: null });
  });

  it("danh sách hội thoại lọc được chỉ nhóm / chỉ bạn bè (tab của hộp Chia sẻ)", () => {
    const s = setup();
    const ids = (kind: "group" | "friend") => listThreadsPage(s.db, { limit: 10, offset: 0, kind }).threads.map((t) => t.threadId);
    assert.deepEqual(ids("group"), ["g-1"]);
    assert.deepEqual(ids("friend"), ["u-lan"]);
  });
});
