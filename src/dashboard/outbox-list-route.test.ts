import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertContacts } from "../storage/contact-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { enqueueOutboxItem, markSendFailed } from "../storage/outbox-store.js";
import type { OutboxListResponse } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

/** Hàng đợi có: 2 nháp, 1 lỗi, 1 bị từ chối, 1 chờ gửi; hội thoại My Documents chỉ có tên + avatar trong danh bạ */
async function setup() {
  const h = await createDashboardHarness();
  const db = h.nick("test").db;
  upsertContacts(db, [{ userId: "u-docs", displayName: "My Documents", avatarUrl: "https://s.zalo.me/zds_cic_my_documents.png" }]);
  upsertMessage(db, sampleMessage({ msgId: "1", threadId: "u-docs", senderId: "me", isSelf: true, text: "cất file" }), {
    source: "live",
    receivedAt: "2026-11-09T03:00:00.000Z",
  });
  db.prepare("UPDATE threads SET name = NULL WHERE thread_id = 'u-docs'").run();
  const queue = (status: "draft" | "approved") =>
    enqueueOutboxItem(db, { threadId: "u-docs", threadType: "user", text: "tin", mode: "single", notBefore: null, batchId: null, createdBy: "mcp", note: null, status });
  queue("draft");
  queue("draft");
  markSendFailed(db, queue("approved"), "Zalo từ chối");
  const rejected = queue("approved");
  db.prepare("UPDATE outbox SET status = 'rejected' WHERE id = ?").run(rejected);
  queue("approved");
  return { ...h, cookie: await h.login() };
}

describe("danh sách Hàng đợi", () => {
  it("tab Lỗi lấy cả failed lẫn rejected trong một lần gọi; số đếm theo trạng thái của cả hàng đợi", async () => {
    const h = await setup();
    const res = (await (await h.call("/api/outbox?status=failed,rejected", { cookie: h.cookie })).json()) as OutboxListResponse;
    assert.deepEqual(res.items.map((i) => i.status).sort(), ["failed", "rejected"]);
    assert.deepEqual(res.counts, { draft: 2, approved: 1, sending: 0, sent: 0, failed: 1, cancelled: 0, rejected: 1 });
  });

  it("trạng thái lạ bị bỏ qua (không có gì hợp lệ = tất cả)", async () => {
    const h = await setup();
    const res = (await (await h.call("/api/outbox?status=bogus", { cookie: h.cookie })).json()) as OutboxListResponse;
    assert.equal(res.items.length, 5);
  });

  it("hội thoại không có tên riêng (My Documents) hiện tên + avatar trong danh bạ, không còn '(chưa rõ tên)'", async () => {
    const h = await setup();
    const res = (await (await h.call("/api/outbox?status=draft", { cookie: h.cookie })).json()) as OutboxListResponse;
    assert.equal(res.items[0]?.threadName, "My Documents");
    assert.equal(res.items[0]?.threadAvatarUrl, "https://s.zalo.me/zds_cic_my_documents.png");
  });
});
