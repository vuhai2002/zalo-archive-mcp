import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { readLookupPause, saveLookupPause } from "../storage/directory-lookup-pause-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { saveStickerCatalog } from "../storage/sticker-store.js";
import { startDirectoryLookupLoop } from "./directory-lookup-loop.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T00:31:00.000Z" };
const sticker = (msgId: string, id: number) =>
  sampleMessage({ msgId, msgType: "chat.sticker", text: "[sticker]", rawJson: JSON.stringify({ content: { id } }) });

/** Chạy vòng hỏi tới hết lượt đầu (5 giây sau khi bật) rồi dừng */
async function runFirstRound(api: API, db: ReturnType<typeof openArchiveDatabase>) {
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
}

describe("vòng hỏi danh bạ", () => {
  it("cả hai loại hỏi đang nghỉ vì Zalo chặn: sticker vẫn có ảnh, không hỏi nhóm / hồ sơ", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sticker("1", 51002), live);
    upsertMessage(db, sticker("2", 51003), live);
    saveStickerCatalog(db, 51002, "https://zalo-api.zadn.vn/sticker/51002.webp");
    saveLookupPause(db, "groups", { untilMs: Date.now() + 3_600_000, times: 2 });
    saveLookupPause(db, "contacts", { untilMs: Date.now() + 3_600_000, times: 2 });

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

    await runFirstRound(api, db);

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

  it("Zalo chặn hỏi hồ sơ không kéo theo hỏi nhóm; hỏi nhóm bị chặn thì chỉ nhóm nghỉ", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "g1", threadType: "group", threadId: "777", senderId: "55" }), live);
    saveLookupPause(db, "contacts", { untilMs: Date.now() + 3_600_000, times: 5 });

    const askedGroups: string[][] = [];
    const rateLimited = Object.assign(new Error("Bạn đã hỏi quá nhiều"), { code: 221 });
    const api = {
      getAllFriends: async () => [],
      getStickersDetail: async () => [],
      getGroupInfo: async (ids: string[]) => {
        askedGroups.push(ids);
        return { gridInfoMap: { "777": { name: "Nhóm mới", fullAvt: "", memVerList: ["55_0", "66_0", "77_0"], totalMember: 3 } } };
      },
      getUserInfo: async () => assert.fail("hỏi hồ sơ đang nghỉ"),
    } as unknown as API;
    await runFirstRound(api, db);
    assert.deepEqual(askedGroups, [["777"]], "nhóm mới vẫn được hỏi khi hỏi hồ sơ đang nghỉ");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = '777'").get()?.n, 3);

    // Lượt sau: hỏi nhóm bị chặn thì nhóm nghỉ, lệnh nghỉ của hỏi hồ sơ giữ nguyên
    db.prepare("UPDATE threads SET name_lookup_at = NULL, avatar_url = NULL").run();
    const blocked = { ...api, getGroupInfo: async () => Promise.reject(rateLimited) } as unknown as API;
    await runFirstRound(blocked, db);
    assert.equal(readLookupPause(db, "groups").times, 1);
    assert.equal(readLookupPause(db, "contacts").times, 5);
  });
});
