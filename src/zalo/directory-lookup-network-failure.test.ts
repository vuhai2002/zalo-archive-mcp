import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { contactsNeedingLookup } from "../storage/contact-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { groupsMissingName } from "../storage/thread-directory-store.js";
import { resolveMissingGroupInfo, resolveUnknownContacts } from "./contact-directory-sync.js";

const live = { source: "live" as const, receivedAt: "2026-03-07T03:30:00.000Z" };
const log = createSilentLogger();
const LONG_AGO = "2000-01-01T00:00:00.000Z";

function seeded() {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage({ msgId: "1", threadId: "u-lan", senderId: "u-lan" }), live);
  upsertMessage(db, sampleMessage({ msgId: "2", threadId: "g-1", threadType: "group", senderId: "u-minh" }), live);
  return db;
}

/** Hai dạng lỗi mạng thật: zca-js gói mã vào câu báo, hoặc `fetch` của Node để mã ở `cause` */
const networkErrors = [
  () => new TypeError("fetch failed: getaddrinfo ENOTFOUND tt-profile-wpa.chat.zalo.me"),
  () => Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } }),
];

describe("hỏi danh bạ lúc chưa có mạng", () => {
  it("hỏi hồ sơ mất mạng: không tính là đã hỏi, lượt sau hỏi lại được ngay", async () => {
    for (const fail of networkErrors) {
      const db = seeded();
      const api = { getUserInfo: async () => Promise.reject(fail()) } as unknown as API;
      assert.equal(await resolveUnknownContacts(api, db, log), "offline");
      assert.deepEqual(contactsNeedingLookup(db, 10, LONG_AGO).sort(), ["u-lan", "u-minh"]);
    }
  });

  it("hỏi nhóm mất mạng: không tính là đã hỏi, có mạng lại thì lấy được tên nhóm", async () => {
    const db = seeded();
    const offline = { getGroupInfo: async () => Promise.reject(networkErrors[0]!()) } as unknown as API;
    assert.equal(await resolveMissingGroupInfo(offline, db, log), "offline");
    assert.deepEqual(groupsMissingName(db, 10, LONG_AGO), ["g-1"]);

    const online = { getGroupInfo: async () => ({ gridInfoMap: { "g-1": { name: "Nhóm", fullAvt: "https://g.zadn.vn/a.jpg" } } }) };
    assert.equal(await resolveMissingGroupInfo(online as unknown as API, db, log), "done");
    assert.equal(db.prepare("SELECT name FROM threads WHERE thread_id = 'g-1'").get()?.name, "Nhóm");
  });
});
