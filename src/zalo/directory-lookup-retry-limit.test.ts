import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { ARCHIVE_MIGRATIONS } from "../storage/archive-schema-migrations.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { resolveMissingGroupInfo, resolveUnknownContacts } from "./contact-directory-sync.js";
import { applyGroupEvent } from "./directory-event-handlers.js";

const live = { source: "live" as const, receivedAt: "2026-11-07T01:00:00.000Z" };
const log = createSilentLogger();
type Db = ReturnType<typeof openArchiveDatabase>;

/** Giả một ngày trôi qua: lần hỏi trước lùi về quá khứ, đủ hạn hỏi lại */
const aDayLater = (db: Db) => {
  db.prepare("UPDATE contacts SET lookup_at = '2000-01-01T00:00:00.000Z' WHERE lookup_at IS NOT NULL").run();
  db.prepare("UPDATE threads SET name_lookup_at = '2000-01-01T00:00:00.000Z' WHERE name_lookup_at IS NOT NULL").run();
};

describe("hỏi Zalo mà không ra: tối đa 3 lần rồi thôi", () => {
  it("người Zalo không trả hồ sơ / trả hồ sơ trống: hỏi lại mỗi ngày, đủ 3 lần thì thôi; người có hồ sơ chỉ hỏi một lần", async () => {
    const db = openArchiveDatabase(":memory:");
    for (const [msgId, who] of [["1", "u-gone"], ["2", "u-blank"], ["3", "u-ok"]] as const) {
      upsertMessage(db, sampleMessage({ msgId, threadId: who, senderId: who }), live);
    }
    const asked: string[][] = [];
    const api = {
      getUserInfo: async (ids: string[]) => {
        asked.push([...ids].sort());
        return {
          changed_profiles: {
            "u-blank_0": { userId: "u-blank", displayName: "", avatar: "" },
            "u-ok_0": { userId: "u-ok", displayName: "Ok", avatar: "https://ava.zadn.vn/ok.jpg" },
          },
        };
      },
    } as unknown as API;

    for (let day = 0; day < 5; day++) {
      await resolveUnknownContacts(api, db, log);
      aDayLater(db);
    }
    assert.deepEqual(asked, [["u-blank", "u-gone", "u-ok"], ["u-blank", "u-gone"], ["u-blank", "u-gone"]]);
  });

  it("nhóm Zalo đã trả (không đặt ảnh, nhóm đông thiếu thành viên) không hỏi lại; nhóm Zalo không trả hỏi tối đa 3 lần", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", threadId: "g-found", threadType: "group", senderId: "u-1" }), live);
    upsertMessage(db, sampleMessage({ msgId: "2", threadId: "g-left", threadType: "group", senderId: "u-2" }), live);
    const asked: string[][] = [];
    const api = {
      getGroupInfo: async (ids: string[]) => {
        asked.push([...ids].sort());
        return { gridInfoMap: { "g-found": { name: "Nhóm đông", avt: "", fullAvt: "", totalMember: 900, memVerList: ["u-1_0"] } } };
      },
    } as unknown as API;

    for (let day = 0; day < 5; day++) {
      await resolveMissingGroupInfo(api, db, log);
      aDayLater(db);
    }
    assert.deepEqual(asked, [["g-found", "g-left"], ["g-left"], ["g-left"]]);

    // Nhóm đổi ảnh: hỏi lại như nhóm mới
    applyGroupEvent(db, { act: "update_avatar", data: { groupId: "g-found" } });
    await resolveMissingGroupInfo(api, db, log);
    assert.deepEqual(asked.at(-1), ["g-found"]);
  });

  it("sự kiện vào nhóm không kèm tên / avatar: vẫn ghi nhận người đó và chưa tính là đã hỏi", async () => {
    const { contactsNeedingLookup } = await import("../storage/contact-store.js");
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, sampleMessage({ msgId: "1", threadId: "g-1", threadType: "group", senderId: "u-1" }), live);
    applyGroupEvent(db, { act: "join", data: { groupId: "g-1", totalMembers: 2, updateMembers: [{ id: "u-new" }] } });
    assert.ok(contactsNeedingLookup(db, 50, "2000-01-01T00:00:00.000Z").includes("u-new"));
  });

  it("nâng kho: người / nhóm đang thiếu mà đã hỏi trước đây tính là trượt 1 lần, còn hỏi thêm 2 lần", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-lookup-attempts-"));
    const file = path.join(dir, "archive.db");
    const old = new DatabaseSync(file);
    ARCHIVE_MIGRATIONS.slice(0, 23).forEach((sql) => old.exec(sql));
    old.exec("PRAGMA user_version = 23");
    const asked = "2026-03-06T10:00:00.000Z";
    const contact = old.prepare("INSERT INTO contacts (user_id, avatar_url, updated_at, lookup_at) VALUES (?, ?, ?, ?)");
    contact.run("u-asked-empty", null, asked, asked);
    contact.run("u-has-avatar", "https://ava.zadn.vn/a.jpg", asked, asked);
    contact.run("u-never-asked", null, asked, null);
    const group = old.prepare("INSERT INTO threads (thread_id, thread_type, name, updated_at, name_lookup_at) VALUES (?, 'group', ?, ?, ?)");
    group.run("g-no-name", null, asked, asked);
    group.run("g-named", "Nhóm", asked, asked);
    old.close();

    const db = openArchiveDatabase(file);
    try {
      const contacts = db.prepare("SELECT user_id, lookup_attempts FROM contacts ORDER BY user_id").all();
      assert.deepEqual(contacts.map((r) => [r.user_id, r.lookup_attempts]), [["u-asked-empty", 1], ["u-has-avatar", 0], ["u-never-asked", 0]]);
      const groups = db.prepare("SELECT thread_id, name_lookup_attempts FROM threads ORDER BY thread_id").all();
      assert.deepEqual(groups.map((r) => [r.thread_id, r.name_lookup_attempts]), [["g-named", 0], ["g-no-name", 1]]);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
