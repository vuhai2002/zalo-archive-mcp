import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { upsertContacts } from "./contact-store.js";
import { findSendersByName } from "./message-sender-lookup.js";
import { countMessages, searchMessages } from "./message-search-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

const live = { source: "live" as const, receivedAt: "2026-03-10T07:00:00.000Z" };
const at = (min: number) => new Date(Date.UTC(2026, 2, 10, 7, min)).toISOString();

/** Hai nhóm: Lan nhắn nhiều tin ở g-1, một người khác cũng tên Lan nhắn ở g-2, Minh nhắn ở cả hai; mình nhắn ở g-1 */
function seeded() {
  const db = openArchiveDatabase(":memory:");
  let n = 0;
  const add = (threadId: string, senderId: string, senderName: string, text: string, isSelf = false) => {
    n++;
    upsertMessage(
      db,
      sampleMessage({ msgId: String(n), cliMsgId: `c${n}`, threadId, threadType: "group", senderId, senderName, isSelf, text, sentAt: at(n) }),
      live,
    );
  };
  for (let i = 0; i < 25; i++) add("g-1", "u-lan", "Lan", `Tin họp số ${i}`);
  add("g-1", "u-minh", "Minh", "Hẹn họp lúc 9h nhé");
  add("g-1", "u-toi", "Tôi", "Đã nhận", true);
  add("g-2", "u-lan-2", "Lan", "Tin thử của nhóm mẫu");
  add("g-2", "u-minh", "Minh", "Họp ở phòng lớn");
  upsertContacts(db, [
    { userId: "u-lan", displayName: "Lan", avatarUrl: null },
    { userId: "u-lan-2", displayName: "Lan", avatarUrl: null },
    { userId: "u-minh", displayName: "Minh", avatarUrl: null },
  ]);
  db.prepare("UPDATE contacts SET alias = 'Lan lớp vẽ' WHERE user_id = 'u-lan'").run();
  return db;
}

describe("đếm tin khớp và tìm người gửi theo tên", () => {
  it("countMessages đếm đúng tổng số tin khớp cùng điều kiện với searchMessages (để phân trang)", () => {
    const db = seeded();
    assert.equal(countMessages(db, { query: "hop" }), 27);
    assert.equal(countMessages(db, { query: "hop", threadId: "g-2" }), 1);
    assert.equal(countMessages(db, { senderId: "u-lan", threadId: "g-1" }), 25);
    const page2 = searchMessages(db, { senderId: "u-lan", limit: 20, offset: 20 });
    assert.equal(page2.length, 5, "trang 2 còn 5 tin");
    assert.equal(countMessages(db, {}), 0, "không điều kiện thì không liệt kê cả kho");
  });

  it("tìm người gửi theo tên không dấu; trong một hội thoại chỉ xét người đã nhắn ở đó; trùng tên thì trả hết kèm số tin", () => {
    const db = seeded();
    const all = findSendersByName(db, "lan");
    assert.deepEqual(all.map((s) => [s.senderId, s.count]), [["u-lan", 25], ["u-lan-2", 1]], "nhiều tin trước");
    assert.equal(all[0]!.name, "Lan lớp vẽ", "tên gợi nhớ được ưu tiên");
    assert.deepEqual(findSendersByName(db, "LOP VE").map((s) => s.senderId), ["u-lan"]);
    assert.deepEqual(findSendersByName(db, "lan", { threadId: "g-2" }).map((s) => s.senderId), ["u-lan-2"]);
    assert.deepEqual(findSendersByName(db, "minh", { threadId: "g-1" }).map((s) => [s.senderId, s.count]), [["u-minh", 1]]);
    assert.deepEqual(findSendersByName(db, "không ai tên vậy"), []);
  });

  it("người chưa có trong danh bạ vẫn tìm được theo tên hiện trong tin", () => {
    const db = seeded();
    upsertMessage(db, sampleMessage({ msgId: "x1", cliMsgId: "cx1", threadId: "g-2", threadType: "group", senderId: "u-la", senderName: "Khương Thử Nghiệm", text: "Xin chào", sentAt: at(90) }), live);
    assert.deepEqual(findSendersByName(db, "khuong thu").map((s) => [s.senderId, s.name, s.count]), [["u-la", "Khương Thử Nghiệm", 1]]);
  });
});
