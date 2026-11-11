import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { normalizeZaloLabels, replaceZaloLabels } from "../storage/zalo-label-store.js";
import type { ThreadListResponse, ZaloLabelsResponse } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const AT = "2026-11-11T03:00:00.000Z";

/** Kho có nhóm 111 (nhóm bạn), người 222 (bạn bè), người 333 (riêng tư) */
async function setup() {
  const h = await createDashboardHarness();
  const db = h.nick("test").db;
  const msg = (msgId: string, threadId: string, threadType: "user" | "group") =>
    upsertMessage(db, sampleMessage({ msgId, threadId, threadType, senderId: "u-x", sentAt: AT }), { source: "live", receivedAt: AT });
  msg("1", "111", "group");
  msg("2", "222", "user");
  msg("3", "333", "user");
  return { ...h, db, cookie: await h.login() };
}

describe("chế độ trình chiếu: thẻ Phân loại và danh sách theo id", () => {
  it("/api/labels: thẻ đã đồng bộ, chỉ giữ hội thoại kho có (nhóm theo mã 'g' của Zalo); chưa đồng bộ thì rỗng", async () => {
    const h = await setup();
    const empty = (await (await h.call("/api/labels", { cookie: h.cookie })).json()) as ZaloLabelsResponse;
    assert.deepEqual(empty, { labels: [], syncedAt: null });

    replaceZaloLabels(h.db, normalizeZaloLabels([{ id: 5, text: "Nhóm Sổ Tay Mẫu", color: "#1e88e5", conversations: ["g111", "222", "g999"] }]), new Date(AT));
    const r = (await (await h.call("/api/labels", { cookie: h.cookie })).json()) as ZaloLabelsResponse;
    assert.deepEqual(r, { labels: [{ id: 5, name: "Nhóm Sổ Tay Mẫu", color: "#1e88e5", emoji: null, threadIds: ["111", "222"] }], syncedAt: AT });
  });

  it("/api/threads?ids=: chỉ các hội thoại được chọn, tìm tên vẫn chạy trong phạm vi đó; id rác bị bỏ", async () => {
    const h = await setup();
    const list = async (q: string) => ((await (await h.call(`/api/threads?${q}`, { cookie: h.cookie })).json()) as ThreadListResponse).threads.map((t) => t.threadId).sort();
    assert.deepEqual(await list("ids=111,222"), ["111", "222"]);
    assert.deepEqual(await list("ids=111,abc,333"), ["111", "333"]);
    assert.deepEqual(await list("ids="), []);
    assert.deepEqual(await list(""), ["111", "222", "333"]);
  });
});
