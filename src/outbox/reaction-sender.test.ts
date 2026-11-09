import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getReactionRequest, requestReaction, type ReactionRequest } from "../storage/reaction-request-store.js";
import { setKillSwitch } from "../storage/send-control-store.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { ReactionSender } from "./reaction-sender-loop.js";
import { reactToArchivedMessage } from "./request-message-reaction.js";

const NOW = "2037-11-09T12:00:00.000Z";
const REQ = { msgId: "8470001", cliMsgId: "1700000000000", threadId: "g-1", threadType: "group" as const, icon: "/-heart" };

function setup(o: { readOnly?: boolean; connected?: boolean; fail?: boolean } = {}) {
  const db = openArchiveDatabase(":memory:");
  const calls: ReactionRequest[] = [];
  const sender = new ReactionSender({
    db,
    log: createSilentLogger(),
    isReadOnly: () => o.readOnly ?? false,
    isListenerConnected: () => o.connected ?? true,
    react: async (r) => {
      if (o.fail) throw new Error("mã lỗi 114");
      calls.push(r);
    },
    now: () => new Date(NOW),
  });
  return { db, calls, sender, id: requestReaction(db, REQ, NOW) };
}

describe("thả cảm xúc từ dashboard (daemon làm)", () => {
  it("gọi Zalo đúng tin + cảm xúc rồi đánh xong; hết yêu cầu thì không gọi gì", async () => {
    const s = setup();
    await s.sender.tick();
    await s.sender.tick();
    assert.deepEqual(
      s.calls.map((c) => [c.msgId, c.cliMsgId, c.threadId, c.threadType, c.icon]),
      [["8470001", "1700000000000", "g-1", "group", "/-heart"]],
    );
    assert.equal(getReactionRequest(s.db, s.id)!.doneAt, NOW);
  });

  it("Chỉ đọc / khóa khẩn cấp: đánh lỗi, không gọi Zalo; Zalo báo lỗi thì ghi lại lỗi", async () => {
    const ro = setup({ readOnly: true });
    await ro.sender.tick();
    assert.match(getReactionRequest(ro.db, ro.id)!.error ?? "", /Chỉ đọc/);

    const killed = setup();
    setKillSwitch(killed.db, true, "thử");
    await killed.sender.tick();
    assert.match(getReactionRequest(killed.db, killed.id)!.error ?? "", /Khóa khẩn cấp/);
    assert.equal(killed.calls.length, 0);

    const bad = setup({ fail: true });
    await bad.sender.tick();
    assert.match(getReactionRequest(bad.db, bad.id)!.error ?? "", /Zalo không nhận: mã lỗi 114/);
  });

  it("listener đang rớt: để yêu cầu chờ, không đánh lỗi", async () => {
    const s = setup({ connected: false });
    await s.sender.tick();
    const r = getReactionRequest(s.db, s.id)!;
    assert.deepEqual([r.doneAt, r.error, s.calls.length], [null, null, 0]);
  });

  it("dùng chung cho dashboard + MCP: kiểm tin, ghi yêu cầu, chờ daemon thả xong; quá giờ thì bỏ yêu cầu", async () => {
    const s = setup();
    s.db.prepare("UPDATE reaction_requests SET done_at = ?").run(NOW); // bỏ yêu cầu mẫu của setup
    const add = (msgId: string, cliMsgId: string) =>
      upsertMessage(s.db, sampleMessage({ msgId, cliMsgId, threadId: "g-1", threadType: "group" }), { source: "live", receivedAt: NOW });
    add("8470002", "1700000000001");
    add("mb_1600000000101", "1600000000101");
    const idOf = (msgId: string) => (s.db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number }).id;
    // "Ngủ" = cho daemon chạy một lượt
    const ok = await reactToArchivedMessage(s.db, idOf("8470002"), ":>", { waitMs: 5_000, sleep: () => s.sender.tick() });
    assert.deepEqual(ok, { ok: true });
    assert.deepEqual(s.calls.at(-1) && [s.calls.at(-1)!.msgId, s.calls.at(-1)!.icon], ["8470002", ":>"]);
    const phone = await reactToArchivedMessage(s.db, idOf("mb_1600000000101"), ":>", { waitMs: 5_000 });
    assert.match(phone.ok ? "" : phone.error, /mã Zalo/);
    const odd = await reactToArchivedMessage(s.db, idOf("8470002"), "/-rose", { waitMs: 5_000 });
    assert.match(odd.ok ? "" : odd.error, /không hợp lệ/);
    const late = await reactToArchivedMessage(s.db, idOf("8470002"), "/-heart", { waitMs: 0, sleep: async () => {} });
    assert.equal(late.ok ? false : late.timedOut, true);
    await s.sender.tick();
    assert.equal(s.calls.length, 1, "yêu cầu quá giờ đã bỏ, daemon không thả muộn");
  });
});
