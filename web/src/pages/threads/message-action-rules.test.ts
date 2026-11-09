import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArchivedMessage } from "../../archive-api-types";
import { canForward, canReply, copyTextOf, MENU_W, menuPosition } from "./message-action-rules";

const msg = (o: Partial<ArchivedMessage>): ArchivedMessage => ({
  id: 1,
  msgId: "m1",
  threadId: "u-lan",
  threadType: "user",
  senderId: "u-lan",
  senderName: "Lan",
  senderAvatarUrl: null,
  isSelf: false,
  msgType: "webchat",
  text: "nhớ nộp bài nhé",
  quoteMsgId: null,
  sentAt: "2026-11-09T03:00:00.000Z",
  recalledAt: null,
  source: "live",
  textStyles: [],
  call: null,
  album: null,
  link: null, contactCard: null, quote: null, video: null, noticeAvatar: null,
  reactions: [],
  attachments: [],
  ...o,
});
const LINK = { url: "https://a.vn/x", text: "xem https://a.vn/x", textStyles: [], title: null, description: null, domain: "a.vn", thumbUrl: null, thumbAspect: null };

describe("thao tác trên tin (thanh nút khi rê chuột)", () => {
  it("chuyển tiếp chỉ tin chữ / link chưa thu hồi; trả lời mọi tin trừ đã thu hồi và bình chọn", () => {
    assert.equal(canForward(msg({})), true);
    assert.equal(canForward(msg({ msgType: "chat.recommended", text: "", link: LINK })), true);
    assert.equal(canForward(msg({ msgType: "chat.photo", text: "" })), false);
    assert.equal(canForward(msg({ recalledAt: "2026-11-09T04:00:00.000Z" })), false);
    assert.equal(canReply(msg({ msgType: "chat.photo", text: "" })), true);
    assert.equal(canReply(msg({ msgType: "group.poll" })), false);
    assert.equal(canReply(msg({ recalledAt: "2026-11-09T04:00:00.000Z" })), false);
  });

  it("Copy: chữ của tin (link: chữ người gửi gõ), album: các chú thích; không có chữ thì không copy được", () => {
    assert.equal(copyTextOf(msg({}), null), "nhớ nộp bài nhé");
    assert.equal(copyTextOf(msg({ link: LINK, text: "khác" }), null), "xem https://a.vn/x");
    assert.equal(copyTextOf(msg({ msgType: "chat.photo", text: "" }), null), null);
    const album = [msg({ id: 1, text: "ảnh 1" }), msg({ id: 2, text: "" }), msg({ id: 3, text: "ảnh 3" })];
    assert.equal(copyTextOf(album[0]!, album), "ảnh 1\nảnh 3");
  });

  it("menu Thêm như Zalo: mép thẳng nút Thêm, mở lên khi phía dưới chật, luôn nằm trong cửa sổ", () => {
    const vp = { width: 1500, height: 800 };
    const btn = (left: number, top: number) => ({ left, right: left + 28, top, bottom: top + 28 });
    // Tin người khác ở cuối khung: mép trái theo nút, đáy menu ngay trên nút
    assert.deepEqual(menuPosition(btn(900, 700), false, vp), { left: 900, bottom: 800 - 700 + 6 });
    // Tin mình: mép phải theo nút; còn nhiều chỗ bên dưới thì mở xuống
    assert.deepEqual(menuPosition(btn(600, 100), true, vp), { left: 628 - MENU_W, top: 134 });
    // Sát mép phải cửa sổ thì dịch vào trong
    assert.equal(menuPosition(btn(1400, 100), false, vp).left, 1500 - MENU_W - 8);
  });
});
