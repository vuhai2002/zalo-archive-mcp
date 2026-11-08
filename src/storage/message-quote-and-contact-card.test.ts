import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactCardOf } from "../archive/zalo-contact-card.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { readThread } from "./message-read-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { setMeta } from "./thread-directory-store.js";

const live = { source: "live" as const, receivedAt: "2026-11-02T00:00:00.000Z" };
const CARD = {
  action: "recommened.user",
  params: "2080000000000000104",
  title: "Âu Mẫn Thoại",
  thumb: "https://s120.avatar.talk.zdn.vn/a/1/2/3/4/120/abcd.jpg",
  description: JSON.stringify({ phone: "0900000001", qrCodeUrl: "https://qr-talk.zdn.vn/0/100000001/abcd.jpg", gUid: "1VMA" }),
};

describe("danh thiếp Zalo", () => {
  it("đọc tên, avatar, số điện thoại, mã QR; ảnh ngoài CDN Zalo thì bỏ; không phải danh thiếp thì null", () => {
    assert.deepEqual(contactCardOf(CARD), {
      userId: "2080000000000000104",
      name: "Âu Mẫn Thoại",
      avatarUrl: CARD.thumb,
      phone: "0900000001",
      qrUrl: "https://qr-talk.zdn.vn/0/100000001/abcd.jpg",
    });
    const noPhone = contactCardOf({ ...CARD, thumb: "https://evil.example/a.jpg", description: JSON.stringify({ qrCodeUrl: "http://qr-talk.zdn.vn/x.jpg" }) });
    assert.deepEqual([noPhone?.avatarUrl, noPhone?.phone, noPhone?.qrUrl], [null, null, null]);
    assert.equal(contactCardOf({ ...CARD, action: "recommened.link" }), null);
  });

  it("có hội thoại 1-1 với người đó trong kho thì dashboard có nút mở hội thoại", () => {
    const db = openArchiveDatabase(":memory:");
    const card = (msgId: string, params: string) =>
      upsertMessage(db, sampleMessage({ msgId, msgType: "chat.recommended", text: "Danh thiếp\nÂu Mẫn Thoại", rawJson: JSON.stringify({ content: { ...CARD, params } }) }), live);
    card("1", "2080000000000000104");
    card("2", "777");
    upsertMessage(db, sampleMessage({ msgId: "3", threadId: "2080000000000000104", senderId: "2080000000000000104" }), live);
    const rows = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.deepEqual(rows.map((r) => r.contactCard?.threadId), ["2080000000000000104", null]);
  });
});

describe("ô trích dẫn của tin trả lời", () => {
  it("tin gốc trong kho: có số tin để nhảy tới, tên theo danh bạ; không có: lấy từ dữ liệu trích dẫn Zalo gửi kèm", () => {
    const db = openArchiveDatabase(":memory:");
    setMeta(db, "self_uid", "u-me");
    upsertMessage(db, sampleMessage({ msgId: "100", senderId: "u-lan", senderName: "Lan", text: "Mai họp lúc mấy giờ?", sentAt: "2026-11-01T01:00:00.000Z" }), live);
    upsertMessage(db, sampleMessage({ msgId: "101", senderId: "u-lan", msgType: "chat.photo", text: "", sentAt: "2026-11-01T01:01:00.000Z" }), live);
    const reply = (msgId: string, quoteMsgId: string, quote: Record<string, unknown>) =>
      upsertMessage(
        db,
        sampleMessage({ msgId, quoteMsgId, senderId: "u-me", isSelf: true, text: "ok", sentAt: `2026-11-02T0${msgId.length}:0${msgId.slice(-1)}:00.000Z`, rawJson: JSON.stringify({ quote }) }),
        live,
      );
    reply("200", "100", { ownerId: "u-lan", msg: "Mai họp lúc mấy giờ?", fromD: "Lan" });
    reply("201", "101", { ownerId: "u-lan", msg: "", fromD: "Lan" });
    reply("202", "999", { ownerId: "u-me", msg: "tin cũ không có trong kho", fromD: "Khê" });
    const byId = new Map(readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 }).map((r) => [r.msgId, r]));
    const originalId = byId.get("100")!.id;
    assert.deepEqual(byId.get("200")!.quote, { id: originalId, senderName: "Lan", isSelf: false, text: "Mai họp lúc mấy giờ?" });
    assert.equal(byId.get("201")!.quote?.text, "[Hình ảnh]");
    assert.deepEqual(byId.get("202")!.quote, { id: null, senderName: "Khê", isSelf: true, text: "tin cũ không có trong kho" });
    assert.equal(byId.get("100")!.quote, null);
  });

  it("tin gốc là link: \"[Link] <tiêu đề>\" như Zalo (không ghép link hai lần); tin của mình vẫn mang tên thật", () => {
    const db = openArchiveDatabase(":memory:");
    setMeta(db, "self_uid", "u-me");
    const link = {
      action: "recommened.link",
      title: "https://app.example.com",
      href: "https://app.example.com/",
      params: JSON.stringify({ mediaTitle: "Sổ tay mẫu", src: "app.example.com" }),
    };
    upsertMessage(
      db,
      sampleMessage({ msgId: "300", msgType: "chat.recommended", senderId: "u-me", senderName: "Lã Văn Khê", isSelf: true, sentAt: "2026-11-07T01:00:00.000Z", rawJson: JSON.stringify({ content: link }) }),
      live,
    );
    const reply = (msgId: string, quoteMsgId: string) =>
      upsertMessage(
        db,
        sampleMessage({
          msgId,
          quoteMsgId,
          senderId: "u-lan",
          text: "link này mở không được nữa",
          sentAt: `2026-11-08T0${msgId.slice(-1)}:00:00.000Z`,
          rawJson: JSON.stringify({ quote: { ownerId: "u-me", msg: "", fromD: "Lã Văn Khê", cliMsgType: 38, attach: JSON.stringify(link) } }),
        }),
        live,
      );
    reply("301", "300");
    reply("302", "999"); // tin gốc không có trong kho: dựng từ `attach` Zalo gửi kèm
    const byId = new Map(readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 }).map((r) => [r.msgId, r]));
    assert.deepEqual(byId.get("301")!.quote, { id: byId.get("300")!.id, senderName: "Lã Văn Khê", isSelf: true, text: "[Link] https://app.example.com" });
    assert.deepEqual(byId.get("302")!.quote, { id: null, senderName: "Lã Văn Khê", isSelf: true, text: "[Link] https://app.example.com" });
  });
});
