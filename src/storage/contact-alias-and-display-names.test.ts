import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { syncContactAliases } from "../zalo/contact-alias-sync.js";
import { groupEventNotice } from "../zalo/normalize-reaction-and-group-event.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { replaceContactAliases } from "./contact-alias-store.js";
import { noteContactSeen, upsertContacts } from "./contact-store.js";
import { findThread, listThreads, readThread } from "./message-read-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { threadLabel } from "./thread-directory-store.js";
import { lastMessagePreview } from "./thread-list-extras.js";

const live = { source: "live" as const, receivedAt: "2026-10-30T03:00:00.000Z" };
const log = createSilentLogger();

/** Truc Ngan nhắn 1-1; "Lư Quế Mẫn" nhắn trong nhóm g-1 - cả hai đều có tên gợi nhớ mình đặt */
function seeded() {
  const db = openArchiveDatabase(":memory:");
  upsertContacts(db, [
    { userId: "u-trucngan", displayName: "Truc Ngan", avatarUrl: null },
    { userId: "u-bth", displayName: "Lư Quế Mẫn", avatarUrl: null },
  ]);
  upsertMessage(db, sampleMessage({ msgId: "1", threadId: "u-trucngan", senderId: "u-trucngan", senderName: "Truc Ngan", text: "Ủa thật hả" }), live);
  upsertMessage(
    db,
    sampleMessage({ msgId: "2", threadId: "g-1", threadType: "group", senderId: "u-bth", senderName: "Lư Quế Mẫn", text: "BÁO CÁO TUẦN 2" }),
    live,
  );
  replaceContactAliases(db, [
    { userId: "u-trucngan", alias: "Anh Hai Công Ty" },
    { userId: "u-bth", alias: "Bác Tám Hàng Xóm" },
  ]);
  return db;
}

describe("tên gợi nhớ (alias) như Zalo PC", () => {
  it("tên hội thoại 1-1, tên người gửi trong nhóm, dòng xem trước đều dùng tên gợi nhớ", () => {
    const db = seeded();
    assert.equal(findThread(db, "u-trucngan")?.name, "Anh Hai Công Ty");
    assert.equal(threadLabel(db, "u-trucngan")?.name, "Anh Hai Công Ty");
    assert.equal(readThread(db, { threadId: "g-1", threadType: "group", limit: 5 })[0]!.senderName, "Bác Tám Hàng Xóm");
    assert.equal(lastMessagePreview(db, "g-1", "group")?.senderName, "Bác Tám Hàng Xóm");
  });

  it("hội thoại không có tên riêng (vd My Documents): lấy tên + avatar trong danh bạ như danh sách hội thoại", () => {
    const db = seeded();
    upsertContacts(db, [{ userId: "u-docs", displayName: "My Documents", avatarUrl: "https://s.zalo.me/zds_cic_my_documents.png" }]);
    upsertMessage(db, sampleMessage({ msgId: "3", threadId: "u-docs", senderId: "me", isSelf: true, text: "cất file" }), live);
    db.prepare("UPDATE threads SET name = NULL WHERE thread_id = 'u-docs'").run();
    const label = threadLabel(db, "u-docs");
    assert.equal(label?.name, "My Documents");
    assert.equal(label?.name, findThread(db, "u-docs")?.name);
    assert.equal(label?.avatarUrl, "https://s.zalo.me/zds_cic_my_documents.png");
  });

  it("tìm theo tên gợi nhớ hay tên thật đều ra; danh sách mới thay cả bộ (bỏ tên gợi nhớ thì về tên thật)", () => {
    const db = seeded();
    assert.deepEqual(listThreads(db, { query: "cong ty", limit: 5 }).map((t) => t.threadId), ["u-trucngan"]);
    assert.deepEqual(listThreads(db, { query: "truc ngan", limit: 5 }).map((t) => t.threadId), ["u-trucngan"]);
    replaceContactAliases(db, [{ userId: "u-bth", alias: "Bác Tám Hàng Xóm" }]);
    assert.equal(findThread(db, "u-trucngan")?.name, "Truc Ngan");
  });

  it("đồng bộ: lấy đủ các trang rồi mới thay; Zalo lỗi thì giữ tên gợi nhớ cũ", async () => {
    const db = seeded();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ userId: `${9000 + i}`, alias: `Người ${i}` }));
    const pages: Record<number, Array<{ userId: string; alias: string }>> = { 1: page1, 2: [{ userId: "777", alias: " Biệt danh mới " }] };
    const asked: number[] = [];
    const ok = { getAliasList: async (_count: number, page: number) => (asked.push(page), { items: pages[page] ?? [], updateTime: "0" }) } as unknown as API;
    await syncContactAliases(ok, db, log);
    assert.deepEqual(asked, [1, 2]);
    assert.equal((db.prepare("SELECT alias FROM contacts WHERE user_id = '777'").get() as { alias: string }).alias, "Biệt danh mới");
    assert.equal(findThread(db, "u-trucngan")?.name, "Truc Ngan", "không còn trong danh sách mới: bỏ tên gợi nhớ");

    const broken = { getAliasList: async () => Promise.reject(new Error("mạng")) } as unknown as API;
    await syncContactAliases(broken, db, log);
    assert.equal((db.prepare("SELECT alias FROM contacts WHERE user_id = '777'").get() as { alias: string }).alias, "Biệt danh mới");
  });
});

describe("không lấy mã số người làm tên", () => {
  it("tin hệ thống nhóm không có tên người làm: tên người gửi để trống; danh bạ không lưu mã số làm tên", () => {
    const db = openArchiveDatabase(":memory:");
    const notice = groupEventNotice(
      { act: "leave", data: { groupId: "2090000000000000107", sourceId: "2050000000000000103", updateMembers: [], time: "1700000000000" } },
      { selfUid: "me", nameOf: () => null, groupNameOf: () => "Công Cụ", receivedAt: new Date() },
    )!;
    assert.equal(notice.text, "2050000000000000103 đã rời khỏi nhóm");
    assert.equal(notice.senderName, null);
    noteContactSeen(db, "2050000000000000103", "2050000000000000103");
    assert.equal((db.prepare("SELECT display_name FROM contacts WHERE user_id = '2050000000000000103'").get() as { display_name: string | null }).display_name, null);
    // Hỏi hồ sơ xong thì tên thật vào được
    upsertContacts(db, [{ userId: "2050000000000000103", displayName: "Nguyễn Văn A", avatarUrl: null }]);
    upsertMessage(db, notice, live);
    assert.equal(lastMessagePreview(db, "2090000000000000107", "group")?.text, "Nguyễn Văn A đã rời khỏi nhóm");
  });
});
