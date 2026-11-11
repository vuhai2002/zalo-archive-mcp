import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import { layoutSpans } from "./message-grouping";
import { collapseAlbums } from "./photo-album-grouping";
import { collapseStickerRuns } from "./sticker-run-grouping";

const TZ = "Asia/Ho_Chi_Minh";
let nextId = 1;

const stickerAtt = (status: AttachmentInfo["status"] = "done") => ({ id: nextId, kind: "sticker", status }) as AttachmentInfo;

/** Tin lúc 10:`minute` ngày 10/11 (giờ VN); mặc định sticker của Lan */
function msg(minute: number, over: Partial<ArchivedMessage> = {}): ArchivedMessage {
  const id = nextId++;
  return {
    id,
    msgId: String(id),
    threadId: "u-lan",
    threadType: "user",
    senderId: "u-lan",
    senderName: "Lan",
    senderAvatarUrl: null,
    isSelf: false,
    msgType: "chat.sticker",
    text: "",
    quoteMsgId: null,
    sentAt: new Date(Date.UTC(2026, 10, 10, 3, minute)).toISOString(),
    recalledAt: null,
    source: "live",
    textStyles: [],
    call: null,
    album: null,
    link: null, contactCard: null, quote: null, video: null, noticeAvatars: [], noticePeople: 0, poll: null,
    reactions: [],
    attachments: [stickerAtt()],
    ...over,
  };
}

const text = (minute: number, over: Partial<ArchivedMessage> = {}) => msg(minute, { msgType: "webchat", text: "chào", attachments: [], ...over });
const shape = (items: ReturnType<typeof collapseStickerRuns>) => items.map((x) => (x.stickers ? `run${x.stickers.length}` : x.msg.msgType === "chat.sticker" ? "sticker" : "text"));

describe("gộp sticker gửi liền nhau như Zalo PC", () => {
  it("sticker liên tiếp cùng người, cùng cụm thành một mục; tin chữ chen giữa thì ngắt; sticker lẻ giữ nguyên", () => {
    const items = collapseAlbums([msg(0), msg(0), msg(1), text(2), msg(3), text(4), msg(5), msg(5)]);
    assert.deepEqual(shape(collapseStickerRuns(items, TZ)), ["run3", "text", "sticker", "text", "run2"]);
  });

  it("khác người gửi, cách quá 5 phút, tin trả lời, đã thu hồi, sticker chưa tải: không gộp", () => {
    const items = collapseAlbums([
      msg(0),
      msg(0, { senderId: "u-me", isSelf: true }),
      msg(10),
      msg(10, { quoteMsgId: "q1" }),
      msg(11, { recalledAt: "2026-11-10T03:12:00.000Z" }),
      msg(11, { attachments: [stickerAtt("failed")] }),
      msg(30),
      msg(36),
    ]);
    assert.deepEqual(shape(collapseStickerRuns(items, TZ)), ["sticker", "sticker", "sticker", "sticker", "sticker", "sticker", "sticker", "sticker"]);
  });

  it("cụm kéo dài vài phút: tin kế tiếp tính khoảng cách từ sticker CUỐI nên vẫn cùng cụm", () => {
    const items = collapseStickerRuns(collapseAlbums([msg(0), msg(4), msg(8), text(11)]), TZ);
    const layouts = layoutSpans(
      items.map((x) => ({ head: x.msg, tail: x.stickers?.at(-1) ?? x.msg })),
      TZ,
    );
    assert.deepEqual(shape(items), ["run3", "text"]);
    assert.equal(layouts[0]?.lastInGroup, false, "cụm sticker chưa phải cuối cụm tin");
    assert.equal(layouts[1]?.firstInGroup, false, "tin chữ 3 phút sau sticker cuối vẫn cùng cụm (không lặp avatar)");
  });
});
