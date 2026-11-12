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

describe("Gửi ngay tin đang hẹn giờ", () => {
  it("tin lẻ hẹn giờ: dời giờ hẹn về bây giờ; tin gửi ngay, tin lô, nháp, tin đã gửi thì từ chối; nick Chỉ đọc 409", async () => {
    const h = await createDashboardHarness();
    const db = h.nick("test").db;
    const cookie = await h.login();
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const add = (o: { notBefore: string | null; mode?: "single" | "batch"; status?: "draft" | "approved" }) =>
      enqueueOutboxItem(db, { threadId: "u-lan", threadType: "user", text: "tin", mode: o.mode ?? "single", notBefore: o.notBefore, batchId: null, createdBy: "mcp", note: null, status: o.status ?? "approved" });
    const scheduled = add({ notBefore: later });
    const sendNow = (id: number) => h.call(`/api/outbox/${id}/send-now`, { ...h.json({}), cookie });

    const before = Date.now();
    const res = await sendNow(scheduled);
    assert.equal(res.status, 200);
    const nb = Date.parse(((await res.json()) as { notBefore: string }).notBefore);
    assert.ok(nb >= before - 1000 && nb <= Date.now() + 1000, "giờ hẹn dời về bây giờ");
    assert.equal((await sendNow(scheduled)).status, 400, "đã tới giờ rồi thì không còn gì để gửi ngay");
    for (const id of [add({ notBefore: null }), add({ notBefore: later, mode: "batch" }), add({ notBefore: later, status: "draft" })]) {
      assert.equal((await sendNow(id)).status, 400);
    }
    const other = add({ notBefore: later });
    h.state.readOnly.add("test");
    assert.equal((await sendNow(other)).status, 409, "nick Chỉ đọc không gửi được");
  });
});

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
