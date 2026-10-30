import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LastMessagePreview } from "../archive-api-types";
import { previewParts, zaloListTime } from "./zalo-list-time-and-preview";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-10-29T04:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("zaloListTime", () => {
  it("giây, phút, giờ, ngày (tới 7), rồi ngày/tháng; khác năm thêm năm", () => {
    assert.equal(zaloListTime(ago(20_000), TZ, NOW), "Vài giây");
    assert.equal(zaloListTime(ago(20 * 60_000), TZ, NOW), "20 phút");
    assert.equal(zaloListTime(ago(3 * 3_600_000), TZ, NOW), "3 giờ");
    assert.equal(zaloListTime(ago(7 * 86_400_000), TZ, NOW), "7 ngày");
    assert.equal(zaloListTime("2026-10-21T03:00:00.000Z", TZ, NOW), "21/10");
    // 18h UTC ngày 31/12/2025 là 1h sáng 01/01/2026 giờ VN: tính năm theo giờ của kho
    assert.equal(zaloListTime("2025-12-31T18:00:00.000Z", TZ, NOW), "01/01");
    assert.equal(zaloListTime("2025-03-05T03:00:00.000Z", TZ, NOW), "05/03/25");
    assert.equal(zaloListTime(null, TZ, NOW), "");
  });
});

const last = (o: Partial<LastMessagePreview>): LastMessagePreview => ({
  isSelf: false,
  senderName: "Lã Văn Khê",
  msgType: "webchat",
  text: "",
  attachmentKind: null,
  attachmentName: null,
  recalled: false,
  ...o,
});

describe("previewParts", () => {
  it('tin mình gửi: "Bạn: " + tên file kèm ghim', () => {
    assert.deepEqual(previewParts(last({ isSelf: true, attachmentKind: "file", attachmentName: "Video mau.mp4" }), "user"), {
      prefix: "Bạn: ",
      icon: "file",
      text: "Video mau.mp4",
    });
  });

  it("tin người khác trong nhóm: TÊN ĐẦY ĐỦ (như Zalo PC) + dòng đầu; 1-1 thì không có tiền tố", () => {
    assert.deepEqual(previewParts(last({ text: "\nchào cả nhà\ndòng 2" }), "group"), { prefix: "Lã Văn Khê: ", icon: null, text: "chào cả nhà" });
    assert.equal(previewParts(last({ text: "hi" }), "user").prefix, "");
  });

  it("ảnh / video: biểu tượng + chữ; thẻ link: biểu tượng link + dòng đầu; tin cuộc gọi không phải link", () => {
    assert.deepEqual(previewParts(last({ attachmentKind: "photo" }), "group"), { prefix: "Lã Văn Khê: ", icon: "image", text: "Hình ảnh" });
    assert.deepEqual(previewParts(last({ attachmentKind: "video" }), "user"), { prefix: "", icon: "video", text: "Video" });
    assert.deepEqual(previewParts(last({ msgType: "chat.recommended", text: "Kế hoạch\nhttps://docs.google.com/x" }), "user"), {
      prefix: "",
      icon: "link",
      text: "Kế hoạch",
    });
    assert.equal(previewParts(last({ msgType: "chat.recommended", text: "Bạn bị nhỡ\nCuộc gọi thoại" }), "user").icon, null);
  });

  it("sticker, thu hồi hiện nhãn như Zalo", () => {
    assert.equal(previewParts(last({ msgType: "chat.sticker", text: "[sticker]", attachmentKind: "sticker" }), "user").text, "[Sticker]");
    assert.equal(previewParts(last({ text: "x", recalled: true }), "user").text, "Tin nhắn đã được thu hồi");
  });
});
