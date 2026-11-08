import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { recallMessageTool } from "../mcp/outbox-recall-tool-handler.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { requestRecall } from "../storage/outbox-recall-store.js";
import { claimForSending, enqueueOutboxItem, getOutboxItem, markSent } from "../storage/outbox-store.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { OutboxRecaller, type SentMessageRef } from "./outbox-recall-loop.js";

const env = parseEnv({});
const NOW = new Date("2026-03-08T02:40:00.000Z");
const live = { source: "live" as const, receivedAt: NOW.toISOString() };

/** Kho đã gửi tin #1 vào nhóm g-1 (msgId 9001), listener đã ghi lại (cliMsgId c9001); #2 còn là nháp */
function setup(opts: { readOnly?: boolean; zaloFails?: boolean } = {}) {
  const db = openArchiveDatabase(":memory:");
  setMeta(db, "daemon_session_state", "running");
  setMeta(db, "listener_heartbeat_at", NOW.toISOString());
  const queue = (status: "draft" | "approved") =>
    enqueueOutboxItem(db, { threadId: "g-1", threadType: "group", text: "tin", mode: "single", notBefore: null, batchId: null, createdBy: "mcp", note: null, status });
  const sent = queue("approved");
  claimForSending(db, sent, NOW.toISOString());
  markSent(db, sent, "9001");
  upsertMessage(db, sampleMessage({ msgId: "9001", cliMsgId: "c9001", threadId: "g-1", threadType: "group", isSelf: true, senderId: "me" }), live);
  const draft = queue("draft");
  const calls: SentMessageRef[] = [];
  const recaller = new OutboxRecaller({
    db,
    log: createSilentLogger(),
    isReadOnly: () => opts.readOnly ?? false,
    now: () => NOW,
    recall: async (m) => {
      if (opts.zaloFails) throw new Error("quá thời gian thu hồi");
      calls.push(m);
    },
  });
  return { db, sent, draft, calls, recaller };
}

describe("thu hồi tin kho đã gửi", () => {
  it("lệnh MCP ghi yêu cầu, daemon thu hồi đúng tin (mã tin + mã tin phía client), tool báo đã thu hồi", async () => {
    const { db, sent, calls, recaller } = setup();
    // Giả daemon: mỗi nhịp chờ của tool thì vòng thu hồi chạy một lần
    const r = await recallMessageTool({ db, env, readOnly: false, now: () => NOW, sleep: () => recaller.tick(), waitTimeoutMs: 5_000 }, { id: sent });
    assert.equal(r.ok, true);
    assert.deepEqual(calls, [{ threadId: "g-1", threadType: "group", msgId: "9001", cliMsgId: "c9001" }]);
    assert.equal(getOutboxItem(db, sent)!.recalledAt, NOW.toISOString());
    const again = await recallMessageTool({ db, env, readOnly: false, now: () => NOW }, { id: sent });
    assert.equal(again.ok, false, "đã thu hồi rồi thì không gọi Zalo lần nữa");
  });

  it("không thu hồi: tin chưa gửi, nick Chỉ đọc; Zalo từ chối thì báo lỗi và cho yêu cầu lại", async () => {
    const { db, sent, draft } = setup();
    assert.equal((await recallMessageTool({ db, env, readOnly: false, now: () => NOW }, { id: draft })).ok, false);
    assert.equal((await recallMessageTool({ db, env, readOnly: true, now: () => NOW }, { id: sent })).ok, false);

    const failing = setup({ zaloFails: true });
    const r = await recallMessageTool(
      { db: failing.db, env, readOnly: false, now: () => NOW, sleep: () => failing.recaller.tick(), waitTimeoutMs: 5_000 },
      { id: failing.sent },
    );
    assert.equal(r.ok, false);
    assert.match(getOutboxItem(failing.db, failing.sent)!.recallError ?? "", /Zalo không cho thu hồi/);
    assert.equal(requestRecall(failing.db, failing.sent, NOW.toISOString()), true, "lỗi rồi thì yêu cầu lại được");

    const readOnly = setup({ readOnly: true });
    requestRecall(readOnly.db, readOnly.sent, NOW.toISOString());
    await readOnly.recaller.tick();
    assert.deepEqual([readOnly.calls.length, getOutboxItem(readOnly.db, readOnly.sent)!.recalledAt], [0, null], "daemon cũng chặn nick Chỉ đọc");
  });

  it("hết giờ chờ mà daemon chưa làm: bỏ yêu cầu, daemon chạy sau cũng không thu hồi muộn", async () => {
    const { db, sent, calls, recaller } = setup();
    const r = await recallMessageTool({ db, env, readOnly: false, now: () => NOW, sleep: async () => {}, waitTimeoutMs: 0 }, { id: sent });
    assert.equal(r.ok, false);
    await recaller.tick();
    assert.deepEqual([calls.length, getOutboxItem(db, sent)!.recalledAt], [0, null]);
  });
});
