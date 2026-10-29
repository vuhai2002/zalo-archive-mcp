import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocalDeletePayload, isRecallPayload, normalizeMessage, normalizeRecall, type RawListenerMessage } from "./normalize-zalo-event.js";
import { zaloTimestampToIso } from "./zalo-message-timestamp.js";

const receivedAt = new Date("2026-10-28T03:00:05.000Z");
const raw = (data: Record<string, unknown>, extra: Partial<RawListenerMessage> = {}): RawListenerMessage => ({
  threadType: "user",
  threadId: "u-lan",
  isSelf: false,
  data: { msgId: "7001", cliMsgId: "c1", uidFrom: "u-lan", dName: "Lan", ts: "1761620400000", ...data },
  ...extra,
});

describe("normalizeMessage", () => {
  it("tin chữ thường", () => {
    const m = normalizeMessage(raw({ msgType: "webchat", content: "Chào anh" }), receivedAt)!;
    assert.equal(m.msgId, "7001");
    assert.equal(m.text, "Chào anh");
    assert.equal(m.sentAt, "2025-10-28T03:00:00.000Z");
    assert.deepEqual(m.attachments, []);
  });

  it("ảnh: lấy params.hd trước, caption làm chữ", () => {
    const content = {
      title: "ảnh hóa đơn",
      href: "https://f21-zpc.zdn.vn/normal.jpg",
      thumb: "https://f21-zpc.zdn.vn/thumb.jpg",
      params: JSON.stringify({ hd: "https://f21-zpc.zdn.vn/hd.jpg" }),
    };
    const m = normalizeMessage(raw({ msgType: "chat.photo", content }), receivedAt)!;
    assert.equal(m.text, "ảnh hóa đơn");
    assert.deepEqual(m.attachments, [
      { kind: "photo", remoteUrl: "https://f21-zpc.zdn.vn/hd.jpg", fileName: null, declaredSize: null },
    ]);
  });

  it("file: tên file từ title, cỡ từ params.fileSize, chữ để trống", () => {
    const content = {
      title: "Báo giá.xlsx",
      href: "https://dl.zdn.vn/f/abc",
      params: JSON.stringify({ fileSize: "20480", fileExt: "xlsx" }),
    };
    const m = normalizeMessage(raw({ msgType: "share.file", content }), receivedAt)!;
    assert.equal(m.text, "");
    assert.deepEqual(m.attachments, [
      { kind: "file", remoteUrl: "https://dl.zdn.vn/f/abc", fileName: "Báo giá.xlsx", declaredSize: 20480 },
    ]);
  });

  it("link: KHÔNG thành đính kèm (URL do người gửi đặt), nhưng giữ trong chữ", () => {
    const content = { title: "Bài viết", href: "http://127.0.0.1/admin", description: "mô tả" };
    const m = normalizeMessage(raw({ msgType: "chat.recommended", content }), receivedAt)!;
    assert.deepEqual(m.attachments, []);
    assert.equal(m.text, "Bài viết\nhttp://127.0.0.1/admin\nmô tả");
  });

  it("link chỉ dán URL (Zalo đặt cùng URL vào tiêu đề, link, mô tả): URL hiện một lần", () => {
    const url = "https://www.facebook.com/share/p/ExampleId1/";
    const content = { title: url, href: url, description: url, action: "recommened.link" };
    assert.equal(normalizeMessage(raw({ msgType: "chat.recommended", content }), receivedAt)!.text, url);
  });

  it("danh thiếp: hiện tên người được giới thiệu, không in JSON (số điện thoại, mã QR) ra chữ", () => {
    const content = {
      title: "Diệp Thư",
      href: "www.zaloapp.com",
      description: JSON.stringify({ phone: "0900000000", qrCodeUrl: "https://qr-talk.zdn.vn/x", gUid: "AB" }),
      action: "recommened.user",
      params: "1234567890",
    };
    assert.equal(normalizeMessage(raw({ msgType: "chat.recommended", content }), receivedAt)!.text, "Danh thiếp\nDiệp Thư");
  });

  it("bài của tài khoản OA (chat.webcontent): tiêu đề + mô tả bài; bản v2 lấy câu tiếng Việt", () => {
    const post = { title: "Ưu đãi tháng này", description: "Áp dụng toàn quốc" };
    const v1 = { title: "", description: "", href: "", params: JSON.stringify({ item: { bundle_data: JSON.stringify({ post }) } }) };
    assert.equal(normalizeMessage(raw({ msgType: "chat.webcontent", content: v1 }), receivedAt)!.text, "Ưu đãi tháng này\nÁp dụng toàn quốc");
    const v2 = { zinstant_msg: JSON.stringify({ customMsg: { msg: { en: "Hello", vi: " ƯU ĐÃI MẪU?\nXin chào" } } }), action: "" };
    assert.equal(normalizeMessage(raw({ msgType: "chat.webcontent.v2", content: v2 }), receivedAt)!.text, "ƯU ĐÃI MẪU?\nXin chào");
    assert.equal(normalizeMessage(raw({ msgType: "chat.webcontent", content: { params: "{hỏng" } }), receivedAt)!.text, "[chat.webcontent]");
  });

  it("lệnh 'xóa ở phía tôi' (chat.delete) không phải tin nhắn: không ghi thành tin", () => {
    const content = [{ type: 1, actionType: 0, uidFrom: "u-me", clientDelMsgId: 1, globalDelMsgId: 8400003000110 }];
    const data = { msgType: "chat.delete", content };
    assert.equal(isLocalDeletePayload(data), true);
    assert.equal(normalizeMessage(raw(data), receivedAt), null);
    assert.equal(isLocalDeletePayload({ msgType: "webchat", content: "xóa giúp mình" }), false);
  });

  it("tin cuộc gọi: dựng câu như Zalo thay cho chữ giữ chỗ 'sendBubbleMessage'", () => {
    const content = {
      title: "sendBubbleMessage",
      description: "Cuộc gọi",
      href: "",
      action: "recommened.calltime",
      params: JSON.stringify({ callId: 1, duration: 2519, isCaller: 0, calltype: 1 }),
    };
    const m = normalizeMessage(raw({ msgType: "chat.recommended", content }), receivedAt)!;
    assert.equal(m.text, "Cuộc gọi video đến\n41 phút 59 giây");
  });

  it("params hỏng hoặc thiếu URL không làm văng, vẫn để lại dấu vết", () => {
    const m = normalizeMessage(raw({ msgType: "chat.photo", content: { params: "{hỏng" } }), receivedAt)!;
    assert.deepEqual(m.attachments, []);
    assert.equal(m.text, "[chat.photo]");
  });

  it("tin nhóm, tự gửi, có trích dẫn; id dạng số được đổi thành chuỗi", () => {
    const m = normalizeMessage(
      raw(
        { msgId: 123456789012, uidFrom: "me", msgType: "webchat", content: "ok", quote: { globalMsgId: 99 } },
        { threadType: "group", threadId: "g-1", isSelf: true },
      ),
      receivedAt,
    )!;
    assert.equal(m.msgId, "123456789012");
    assert.equal(m.threadType, "group");
    assert.equal(m.isSelf, true);
    assert.equal(m.quoteMsgId, "99");
  });

  it("thiếu msgId thì bỏ (không khử trùng được)", () => {
    assert.equal(normalizeMessage(raw({ msgId: undefined, content: "x" }), receivedAt), null);
  });

  it("thẻ thông báo của Zalo (content là mảng thẻ): lấy tiêu đề + mô tả thẻ đầu, bỏ thẻ nút bấm", () => {
    const content = [
      {
        type: "l.a.header.only",
        action: "action.open.logindevices",
        title: "Đăng nhập Zalo trên máy tính thành công",
        description: "Bạn đã đăng nhập Zalo Web trên Windows 10/11\n- Bằng: Mã QR\n",
      },
      { type: "l.a.child.full", action: "action.open.logindevices", title: "Mở lịch sử đăng nhập" },
    ];
    const m = normalizeMessage(raw({ msgType: "chat.list.action", content }), receivedAt)!;
    assert.equal(m.text, "Đăng nhập Zalo trên máy tính thành công\nBạn đã đăng nhập Zalo Web trên Windows 10/11\n- Bằng: Mã QR");
    assert.equal(normalizeMessage(raw({ msgType: "chat.list.action", content: [{ type: "x" }] }), receivedAt)!.text, "[chat.list.action]");
  });
});

describe("thu hồi", () => {
  it("nhận ra payload thu hồi và lấy đúng id tin bị thu hồi", () => {
    const data = { content: { globalMsgId: 7001, cliMsgId: 1, deleteMsg: 1, srcId: 1, destId: 2 } };
    const r = raw(data);
    assert.equal(isRecallPayload(r.data), true);
    assert.equal(normalizeRecall(r, receivedAt)?.msgId, "7001");
    assert.equal(isRecallPayload(raw({ content: "deleteMsg" }).data), false);
  });
});

describe("zaloTimestampToIso", () => {
  it("phân biệt giây và mili, giữ tin cũ, chặn tương lai và rác", () => {
    assert.equal(zaloTimestampToIso("1761620400", receivedAt), "2025-10-28T03:00:00.000Z");
    assert.equal(zaloTimestampToIso(1761620400000, receivedAt), "2025-10-28T03:00:00.000Z");
    assert.equal(zaloTimestampToIso("1500000000000", receivedAt), "2017-07-14T02:40:00.000Z");
    assert.equal(zaloTimestampToIso("4102444800000", receivedAt), receivedAt.toISOString());
    assert.equal(zaloTimestampToIso("abc", receivedAt), receivedAt.toISOString());
    assert.equal(zaloTimestampToIso(12345, receivedAt), receivedAt.toISOString());
  });
});
