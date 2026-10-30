import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../../storage/message-write-store.js";
import { createDashboardHarness } from "../dashboard-test-harness.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T03:00:00.000Z" };

async function setup() {
  const h = await createDashboardHarness();
  const { db } = h.nick("test");
  for (let i = 1; i <= 5; i++) {
    upsertMessage(db, sampleMessage({ msgId: `${i}`, cliMsgId: `c${i}`, text: `tin số ${i}`, sentAt: `2026-10-30T01:0${i}:00.000Z` }), live);
  }
  return { ...h, db, cookie: await h.login() };
}

describe("API tìm tin + nhảy tới tin", () => {
  it("aroundId: trang quanh tin; afterId: tin mới hơn; tin của hội thoại khác thì 404", async () => {
    const s = await setup();
    const get = async (q: string) => (await (await s.call(`/api/threads/u-lan/messages?${q}`, { cookie: s.cookie })).json()) as { messages: Array<{ msgId: string }> };
    assert.deepEqual((await get("aroundId=3&limit=2")).messages.map((m) => m.msgId), ["2", "3"]);
    assert.deepEqual((await get("afterId=3&limit=10")).messages.map((m) => m.msgId), ["4", "5"]);
    upsertMessage(s.db, sampleMessage({ msgId: "99", cliMsgId: "c99", threadId: "u-binh", senderId: "u-binh" }), live);
    const otherId = (s.db.prepare("SELECT id FROM messages WHERE msg_id = '99'").get() as { id: number }).id;
    assert.equal((await s.call(`/api/threads/u-lan/messages?aroundId=${otherId}`, { cookie: s.cookie })).status, 404);
  });

  it("tìm: lọc người gửi, files sai thì 400, bộ lọc lạ 400; người gửi của hội thoại", async () => {
    const s = await setup();
    const search = (q: string) => s.call(`/api/search?${q}`, { cookie: s.cookie });
    const r = (await (await search("senderId=u-lan&threadId=u-lan&limit=2")).json()) as { messages: Array<{ msgId: string; threadName: string | null }> };
    assert.deepEqual(r.messages.map((m) => m.msgId), ["5", "4"]);
    assert.equal((await search("q=tin&files=abc")).status, 400);
    assert.equal((await search("filter=abc")).status, 400);
    assert.equal((await search("filter=mentions")).status, 200);
    const senders = (await (await s.call("/api/threads/u-lan/senders", { cookie: s.cookie })).json()) as { senders: Array<{ senderId: string; count: number }> };
    assert.deepEqual(senders.senders.map((x) => [x.senderId, x.count]), [["u-lan", 5]]);
    assert.equal((await s.call("/api/threads/khong-co/senders", { cookie: s.cookie })).status, 404);
  });
});
