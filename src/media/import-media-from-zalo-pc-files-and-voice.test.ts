import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { importMediaFromZaloPc } from "./import-media-from-zalo-pc.js";
import { copyIntoTemp, NOISE_TRAILER } from "./zalo-pc-file-copy.js";

const SELF = "100";
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
const PDF = Buffer.from(`%PDF-1.7 ${"báo cáo quý ".repeat(30)}`); // dài hơn 100 byte: có phần không bị làm nhiễu
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom clip gửi dạng file")]);
const AAC = Buffer.concat([Buffer.from([0xff, 0xf1, 0x60, 0x40]), Buffer.from("tin thoại")]);

/** Làm nhiễu như Zalo PC: 100 byte đầu XOR 0x93, thêm dấu "zAlO" ở cuối */
function noised(plain: Buffer): Buffer {
  const out = Buffer.from(plain);
  for (let i = 0; i < Math.min(100, out.length); i++) out[i]! ^= 0x93;
  return Buffer.concat([out, NOISE_TRAILER]);
}

function tree(files: Record<string, Buffer>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zam-zalopc-"));
  for (const [rel, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  }
  return root;
}

const snapshot = (dir: string) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => {
    const p = path.join(e.parentPath, e.name);
    return `${path.relative(dir, p)}|${fs.statSync(p).size}|${fs.statSync(p).mtimeMs}`;
  }).sort();

type Db = ReturnType<typeof openArchiveDatabase>;
function failed(db: Db, o: { msgId: string; cliMsgId: string; kind: "file" | "voice"; checksum?: string; fileName?: string; size?: number }) {
  const msg = sampleMessage({
    msgId: o.msgId, cliMsgId: o.cliMsgId, threadType: "user", threadId: "77", senderId: "77",
    msgType: o.kind === "file" ? "share.file" : "chat.voice",
    rawJson: JSON.stringify({ content: { params: JSON.stringify({ checksum: o.checksum }) } }),
    attachments: [{ kind: o.kind, remoteUrl: `https://dl.dlfl.vn/${o.msgId}`, fileName: o.fileName ?? null, declaredSize: o.size ?? null }],
  });
  upsertMessage(db, msg, { source: "mobile_sync", receivedAt: "2026-11-08T00:00:00.000Z" });
  db.prepare("UPDATE attachments SET status = 'failed' WHERE msg_id = ?").run(msg.msgId);
}

describe("lấy từ Zalo PC: file bị làm nhiễu, video gửi dạng file, tin thoại, Zalo Received Files", () => {
  it("bỏ nhiễu đúng bản gốc, kể cả file ngắn hơn 100 byte và file rỗng; file không có dấu nhiễu thì từ chối", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-noise-"));
    for (const plain of [PDF, Buffer.from("ngắn"), Buffer.alloc(0)]) {
      fs.writeFileSync(path.join(dir, "n"), noised(plain));
      const c = await copyIntoTemp(path.join(dir, "n"), path.join(dir, "tmp"), { denoise: true });
      assert.deepEqual([fs.readFileSync(c.tempFile), c.md5, c.sizeBytes], [plain, md5(plain), plain.length]);
    }
    fs.writeFileSync(path.join(dir, "plain"), PDF);
    await assert.rejects(copyIntoTemp(path.join(dir, "plain"), path.join(dir, "tmp"), { denoise: true }));
  });

  it("chép đúng bản, kiểm MD5 / loại, không đụng thư mục Zalo PC", async () => {
    const other = Buffer.from("cùng tên cùng cỡ nhưng khác nội dung!!");
    const dl = tree({
      [`fileNoise/${md5(PDF)}`]: noised(PDF), // chỉ có bản bị làm nhiễu
      "resource/77/video/202_77_77": MP4, // video gửi dạng file
      "resource/77/voice/303_77_77": AAC, // tin thoại kiểu mới
      "voice/9404": AAC, // tin thoại kiểu cũ (tên = mã tin)
      "resource/77/voice/505_77_77": Buffer.from("không phải AAC"),
      [`fileNoise/${md5(Buffer.from("x"))}`]: Buffer.from("thiếu dấu nhiễu"),
    });
    const received = tree({ "Hợp đồng.pdf": PDF, "sub/Khác.pdf": Buffer.alloc(other.length, 1) });
    const before = [snapshot(dl), snapshot(received)];
    const db = openArchiveDatabase(":memory:");
    failed(db, { msgId: "m101", cliMsgId: "101", kind: "file", checksum: md5(PDF), fileName: "báo cáo.pdf" });
    failed(db, { msgId: "m202", cliMsgId: "202", kind: "file", checksum: md5(MP4), fileName: "clip.mp4" });
    failed(db, { msgId: "m303", cliMsgId: "303", kind: "voice" });
    failed(db, { msgId: "9404", cliMsgId: "404", kind: "voice" });
    failed(db, { msgId: "m505", cliMsgId: "505", kind: "voice" });
    failed(db, { msgId: "m606", cliMsgId: "606", kind: "file", checksum: md5(PDF).toUpperCase(), fileName: "Hợp đồng.pdf", size: PDF.length });
    failed(db, { msgId: "m707", cliMsgId: "707", kind: "file", checksum: md5(other), fileName: "Khác.pdf", size: other.length });
    failed(db, { msgId: "m808", cliMsgId: "808", kind: "file", checksum: md5(Buffer.from("x")), fileName: "x.bin" });

    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-media-"));
    const result = await importMediaFromZaloPc({ db, mediaDir, downloadsDir: dl, receivedDirs: [received], selfUid: SELF, log: createSilentLogger(), concurrency: 2 });

    assert.deepEqual(result, { total: 8, processed: 8, recovered: 5, notFound: 0, rejected: 3, failed: 0 });
    const row = (id: string) => db.prepare("SELECT status, local_path, mime FROM attachments WHERE msg_id = ?").get(id) as Record<string, string>;
    const bytes = (id: string) => fs.readFileSync(path.join(mediaDir, row(id).local_path!));
    assert.deepEqual(bytes("m101"), PDF, "bỏ nhiễu ra đúng bản gốc");
    assert.deepEqual([path.extname(row("m202").local_path!), bytes("m202")], [".mp4", MP4]);
    assert.deepEqual([row("m303").mime, row("9404").mime, bytes("9404")], ["audio/aac", "audio/aac", AAC]);
    assert.deepEqual(bytes("m606"), PDF, "Zalo Received Files: cùng tên + cỡ + đúng MD5");
    assert.deepEqual([row("m505").status, row("m707").status, row("m808").status], ["failed", "failed", "failed"]);
    assert.deepEqual([snapshot(dl), snapshot(received)], before, "thư mục Zalo PC không bị đổi gì");
  });

  it("video gửi dạng file chỉ còn ở thư mục video kiểu cũ (tên = mã tin): lấy được, vẫn kiểm MD5", async () => {
    const clip = Buffer.concat([MP4, Buffer.from(" bản chỉ còn ở thư mục cũ")]);
    const dl = tree({
      "video/9901": clip, // 1-1
      "video/group/9902": clip, // nhóm
      "video/9903": Buffer.from("cùng mã tin nhưng sai nội dung"),
    });
    const before = snapshot(dl);
    const db = openArchiveDatabase(":memory:");
    failed(db, { msgId: "9901", cliMsgId: "901", kind: "file", checksum: md5(clip), fileName: "clip.mp4" });
    failed(db, { msgId: "9902", cliMsgId: "902", kind: "file", checksum: md5(clip), fileName: "clip.mp4" });
    failed(db, { msgId: "9903", cliMsgId: "903", kind: "file", checksum: md5(clip), fileName: "clip.mp4" });

    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-media-"));
    const result = await importMediaFromZaloPc({ db, mediaDir, downloadsDir: dl, selfUid: SELF, log: createSilentLogger() });

    assert.deepEqual(result, { total: 3, processed: 3, recovered: 2, notFound: 0, rejected: 1, failed: 0 });
    const row = (id: string) => db.prepare("SELECT status, local_path FROM attachments WHERE msg_id = ?").get(id) as Record<string, string>;
    for (const id of ["9901", "9902"]) assert.deepEqual(fs.readFileSync(path.join(mediaDir, row(id).local_path!)), clip);
    assert.equal(row("9903").status, "failed", "sai MD5 thì không nhận");
    assert.deepEqual(snapshot(dl), before, "thư mục Zalo PC không bị đổi gì");
  });
});
