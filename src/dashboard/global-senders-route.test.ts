import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertContacts } from "../storage/contact-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import type { ThreadSendersResponse } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const live = { source: "live" as const, receivedAt: "2026-03-10T07:00:00.000Z" };

describe("GET /api/senders: chọn người gửi cho ô tìm chung", () => {
  it("luôn có Bạn ở đầu; gõ tên thì ra người khớp (không dấu) kèm số tin", async () => {
    const h = await createDashboardHarness();
    const { db } = h.nick("test");
    db.prepare("INSERT INTO meta (key, value) VALUES ('self_uid', 'u-toi')").run();
    const add = (msgId: string, senderId: string, senderName: string) =>
      upsertMessage(db, sampleMessage({ msgId, cliMsgId: `c${msgId}`, threadId: "g-1", threadType: "group", senderId, senderName, isSelf: senderId === "u-toi" }), live);
    add("1", "u-lan", "Lan");
    add("2", "u-lan", "Lan");
    add("3", "u-minh", "Minh");
    add("4", "u-toi", "Tôi");
    upsertContacts(db, [
      { userId: "u-lan", displayName: "Lan", avatarUrl: null },
      { userId: "u-minh", displayName: "Minh", avatarUrl: null },
    ]);
    const cookie = await h.login();
    const get = async (q: string) => ((await (await h.call(`/api/senders?q=${encodeURIComponent(q)}`, { cookie })).json()) as ThreadSendersResponse).senders;

    assert.deepEqual((await get("")).map((s) => [s.senderId, s.isSelf]), [["u-toi", true]], "chưa gõ: chỉ có Bạn");
    assert.deepEqual((await get("LAN")).map((s) => [s.senderId, s.count]), [["u-toi", 1], ["u-lan", 2]]);
  });
});
