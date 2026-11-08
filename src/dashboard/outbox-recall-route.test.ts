import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { claimForSending, enqueueOutboxItem, markSent } from "../storage/outbox-store.js";
import type { OutboxItem } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

async function setup() {
  const h = await createDashboardHarness();
  const db = h.nick("test").db;
  const queue = (status: "draft" | "approved") =>
    enqueueOutboxItem(db, { threadId: "g-1", threadType: "group", text: "tin", mode: "single", notBefore: null, batchId: null, createdBy: "mcp", note: null, status });
  const sent = queue("approved");
  claimForSending(db, sent, "2026-03-08T02:10:24.000Z");
  markSent(db, sent, "9001");
  upsertMessage(db, sampleMessage({ msgId: "9001", cliMsgId: "c9001", threadId: "g-1", threadType: "group", isSelf: true, senderId: "me" }), {
    source: "live",
    receivedAt: "2026-03-08T02:10:25.000Z",
  });
  return { ...h, db, sent, draft: queue("draft"), cookie: await h.login() };
}

describe("nút Thu hồi trên trang Hàng đợi", () => {
  it("ghi yêu cầu thu hồi cho tin đã gửi (daemon làm sau); bấm lại khi đang chờ thì báo đang chờ", async () => {
    const h = await setup();
    const res = await h.call(`/api/outbox/${h.sent}/recall`, { ...h.json({}), cookie: h.cookie });
    assert.equal(res.status, 200);
    const item = (await res.json()) as OutboxItem;
    assert.ok(item.recallRequestedAt);
    assert.equal(item.recalledAt, null);
    assert.equal((await h.call(`/api/outbox/${h.sent}/recall`, { ...h.json({}), cookie: h.cookie })).status, 409);
  });

  it("không thu hồi: tin chưa gửi, nick Chỉ đọc; tin người dùng tự thu hồi trên Zalo hiện là đã thu hồi", async () => {
    const h = await setup();
    assert.equal((await h.call(`/api/outbox/${h.draft}/recall`, { ...h.json({}), cookie: h.cookie })).status, 409);
    h.state.readOnly.add("test");
    assert.equal((await h.call(`/api/outbox/${h.sent}/recall`, { ...h.json({}), cookie: h.cookie })).status, 409);
    h.db.prepare("UPDATE messages SET recalled_at = '2026-11-08T05:00:00.000Z' WHERE msg_id = '9001'").run();
    const got = (await (await h.call(`/api/outbox/${h.sent}`, { cookie: h.cookie })).json()) as OutboxItem;
    assert.equal(got.recalledAt, "2026-11-08T05:00:00.000Z");
  });
});
