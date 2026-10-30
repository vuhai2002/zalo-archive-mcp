import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { saveLookupPause } from "../storage/directory-lookup-pause-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { saveStickerCatalog } from "../storage/sticker-store.js";
import { startDirectoryLookupLoop } from "./directory-lookup-loop.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T00:31:00.000Z" };
const sticker = (msgId: string, id: number) =>
  sampleMessage({ msgId, msgType: "chat.sticker", text: "[sticker]", rawJson: JSON.stringify({ content: { id } }) });

describe("vòng hỏi danh bạ", () => {
  it("đang nghỉ vì Zalo chặn hỏi hồ sơ: sticker vẫn có ảnh, không hỏi nhóm / hồ sơ", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sticker("1", 51002), live);
    upsertMessage(db, sticker("2", 51003), live);
    saveStickerCatalog(db, 51002, "https://zalo-api.zadn.vn/sticker/51002.webp");
    saveLookupPause(db, { untilMs: Date.now() + 3_600_000, times: 2 });

    const asked: string[] = [];
    const api = {
      getAllFriends: async () => [],
      getStickersDetail: async (ids: number[]) => {
        asked.push(...ids.map(String));
        return ids.map((id) => ({ id, stickerWebpUrl: `https://zalo-api.zadn.vn/sticker/${id}.webp` }));
      },
      getGroupInfo: async () => assert.fail("đang nghỉ thì không hỏi nhóm"),
      getUserInfo: async () => assert.fail("đang nghỉ thì không hỏi hồ sơ"),
    } as unknown as API;

    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const loop = startDirectoryLookupLoop({
      api,
      db,
      log: createSilentLogger(),
      friendSyncEveryMs: 0,
      contactLookupGapMs: 0,
      rateLimitPauseMs: 1_800_000,
    });
    try {
      mock.timers.tick(5_000);
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    } finally {
      loop.stop();
      mock.timers.reset();
    }

    assert.deepEqual(asked, ["51003"], "sticker đã có trong danh mục thì không hỏi lại Zalo");
    const urls = db.prepare("SELECT msg_id, remote_url FROM attachments WHERE kind = 'sticker' ORDER BY msg_id").all();
    assert.deepEqual(
      urls.map((r) => [r.msg_id, r.remote_url]),
      [
        ["1", "https://zalo-api.zadn.vn/sticker/51002.webp"],
        ["2", "https://zalo-api.zadn.vn/sticker/51003.webp"],
      ],
    );
  });
});
