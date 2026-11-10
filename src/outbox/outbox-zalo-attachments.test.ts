import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { MessageContent, SendMessageResponse } from "zca-js";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";
import { sendFilesThenText, splitFilesForSending } from "./outbox-zalo-attachments.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-files-"));
const file = (name: string, kind: OutboxFile["kind"]): OutboxFile => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(`noi dung ${name}`));
  return { path: p, name, size: 10, kind };
};

/** Hàm gửi giả: ghi lại từng lần gọi (chữ + tên file), trả mã tin tăng dần như Zalo */
function fakeSend() {
  const calls: Array<{ msg: string; files: string[] }> = [];
  let next = 100;
  const send = async (c: MessageContent): Promise<SendMessageResponse> => {
    const files = (Array.isArray(c.attachments) ? c.attachments : c.attachments ? [c.attachments] : []).map((a) => (typeof a === "string" ? a : a.filename));
    calls.push({ msg: c.msg, files });
    return files.length > 0
      ? { message: null, attachment: files.map(() => ({ msgId: next++ })) as unknown as SendMessageResponse["attachment"] }
      : { message: { msgId: next++ } as unknown as NonNullable<SendMessageResponse["message"]>, attachment: [] };
  };
  return { calls, send };
}

describe("gửi file qua Zalo: chùm ảnh, rồi file khác, rồi chữ sau cùng", () => {
  it("3 ảnh + 1 PDF + chữ: ảnh gửi chung một lần (thành chùm), PDF lần sau, chữ cuối cùng; trả mã tin chữ", async () => {
    const f = fakeSend();
    const files = [file("a.jpg", "image"), file("bao-gia.pdf", "file"), file("b.png", "image"), file("c.webp", "image")];
    const r = await sendFilesThenText({ files, text: "Gửi anh ảnh và báo giá" }, f.send, (t) => t);
    assert.deepEqual(f.calls, [
      { msg: "", files: ["a.jpg", "b.png", "c.webp"] },
      { msg: "", files: ["bao-gia.pdf"] },
      { msg: "Gửi anh ảnh và báo giá", files: [] },
    ]);
    // 3 ảnh mang mã 100-102, PDF 103, tin chữ 104
    assert.deepEqual(r, { msgId: "104" });
  });

  it("không có chữ: chỉ gửi file, trả mã file đầu tiên; chữ chỉ có khoảng trắng coi như không có", async () => {
    const f = fakeSend();
    const r = await sendFilesThenText({ files: [file("x.jpg", "image"), file("y.jpg", "image")], text: "  " }, f.send, (t) => t);
    assert.deepEqual(f.calls, [{ msg: "", files: ["x.jpg", "y.jpg"] }]);
    assert.deepEqual(r, { msgId: "100" });
  });

  it("chữ có nhắc tên / trả lời: đi cùng tin chữ (gửi sau file)", async () => {
    const f = fakeSend();
    await sendFilesThenText({ files: [file("hop-dong.pdf", "file")], text: "@Lan xem giúp" }, f.send, (t) => ({ msg: t, mentions: [{ pos: 0, len: 4, uid: "u-lan" }] }));
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1]!.msg, "@Lan xem giúp");
  });

  it("chia nhóm: bỏ nhóm rỗng; video đi cùng nhóm file thường", () => {
    const groups = splitFilesForSending([file("clip.mp4", "video"), file("ghi-chu.txt", "file")]);
    assert.deepEqual(groups.map((g) => g.map((x) => x.name)), [["clip.mp4", "ghi-chu.txt"]]);
  });
});
