import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { NormalizedMessage } from "../archive/archived-message-types.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { importMediaFromZaloPc } from "./import-media-from-zalo-pc.js";
import { buildZaloPcMediaIndex, findZaloPcMedia } from "./zalo-pc-media-index.js";

const SELF = "100";
const JPEG = (tag: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`jpeg ${tag}`)]);
const JXL = (tag: string) => Buffer.concat([Buffer.from([0xff, 0x0a]), Buffer.from(`jxl ${tag}`)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom video")]);
const md5 = (b: Buffer | string) => crypto.createHash("md5").update(b).digest("hex");
const PDF = Buffer.from("%PDF-1.4 báo cáo");

/** Thư mục ZaloDownloads giả, đặt tên như Zalo PC 26.10.20 */
function fakeZaloDownloads(): string {
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), "zam-zalopc-"));
  const put = (rel: string, data: Buffer) => {
    fs.mkdirSync(path.dirname(path.join(dl, rel)), { recursive: true });
    fs.writeFileSync(path.join(dl, rel), data);
  };
  put("resource/g900/picture/111_55_g900_aaaa.jxl", JXL("gốc 111")); // ảnh nhóm: có bản gốc + bản xem trước
  put("resource/g900/Cache/111_55_g900_n", JPEG("xem trước 111"));
  put("resource/g900/picture/222_55_g900_bbbb.jxl", JXL("gốc 222")); // chỉ có bản JXL
  put("resource/g900/Cache/333_55_g900_n", Buffer.from("không phải ảnh")); // bản xem trước hỏng, có bản gốc JPEG
  put("resource/g900/picture/333_55_g900_cccc.jpg", JPEG("gốc 333"));
  put("resource/77/video/444_77_77", MP4); // video 1-1
  put("resource/77/picture/555_100_77_dddd.jpg", JPEG("mình gửi 555")); // ảnh mình gửi trong 1-1
  put(`file/${md5(PDF)}`, PDF); // file thường, đúng MD5
  put(`file/group/${md5("nội dung khác")}`, Buffer.from("bị đổi")); // tên MD5 không khớp nội dung
  put(`fileNoise/${md5(PDF)}x`, PDF); // fileNoise: không dùng
  return dl;
}

function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${path.relative(dir, p)}|${fs.statSync(p).size}|${fs.statSync(p).mtimeMs}`);
    }
  };
  walk(dir);
  return out.sort();
}

function failedMedia(db: ReturnType<typeof openArchiveDatabase>, o: Partial<NormalizedMessage> & { kind: string; checksum?: string }) {
  const msg = sampleMessage({
    ...o,
    msgType: o.kind === "file" ? "share.file" : "chat.photo",
    rawJson: JSON.stringify({ content: { params: JSON.stringify({ checksum: o.checksum }) } }),
    attachments: [{ kind: o.kind as "photo", remoteUrl: `https://photo-stal.zdn.vn/${o.msgId}`, fileName: o.kind === "file" ? "báo cáo.pdf" : null, declaredSize: null }],
  });
  upsertMessage(db, msg, { source: "mobile_sync", receivedAt: "2026-11-01T00:00:00.000Z" });
  db.prepare("UPDATE attachments SET status = 'failed', last_error = 'Zalo đã xóa file cũ khỏi máy chủ - không xin lại link được' WHERE msg_id = ?").run(msg.msgId);
}

describe("lấy lại media từ bản Zalo PC đã tải về máy", () => {
  it("ghép theo mã tin phía client + người gửi + hội thoại (nhóm g<mã>, 1-1, tin mình gửi); file theo MD5, bỏ fileNoise", () => {
    const index = buildZaloPcMediaIndex(fakeZaloDownloads());
    const owner = { threadType: "group" as const, threadId: "900", senderId: "55", isSelf: false, checksum: null };
    const photo = findZaloPcMedia(index, { ...owner, kind: "photo", cliMsgId: "111" }, SELF);
    assert.deepEqual([photo?.kind, !!(photo as { original: string }).original, !!(photo as { preview: string }).preview], ["photo", true, true]);
    assert.equal(findZaloPcMedia(index, { ...owner, kind: "photo", cliMsgId: "999" }, SELF), null);
    assert.equal(findZaloPcMedia(index, { ...owner, kind: "video", cliMsgId: "444", threadType: "user", threadId: "77", senderId: "77" }, SELF)?.kind, "video");
    assert.equal(findZaloPcMedia(index, { ...owner, kind: "photo", cliMsgId: "555", threadType: "user", threadId: "77", senderId: "?", isSelf: true }, SELF)?.kind, "photo");
    assert.equal(findZaloPcMedia(index, { ...owner, kind: "file", cliMsgId: null, checksum: md5(PDF).toUpperCase() }, SELF)?.kind, "file");
    assert.equal(index.plainFiles.size, 2, "chỉ file/ và file/group/, không lấy fileNoise");
  });

  it("chép sang kho, kiểm loại / MD5, đánh đã tải kèm nguồn zalo_pc; không đụng gì thư mục Zalo PC", async () => {
    const dl = fakeZaloDownloads();
    const before = snapshot(dl);
    const db = openArchiveDatabase(":memory:");
    db.prepare("INSERT INTO meta (key, value) VALUES ('self_uid', ?)").run(SELF);
    const group = { threadType: "group" as const, threadId: "900", senderId: "55", isSelf: false };
    failedMedia(db, { ...group, msgId: "m111", cliMsgId: "111", kind: "photo" });
    failedMedia(db, { ...group, msgId: "m222", cliMsgId: "222", kind: "photo" });
    failedMedia(db, { ...group, msgId: "m333", cliMsgId: "333", kind: "photo" });
    failedMedia(db, { threadType: "user", threadId: "77", senderId: "77", isSelf: false, msgId: "m444", cliMsgId: "444", kind: "video" });
    failedMedia(db, { threadType: "user", threadId: "77", senderId: SELF, isSelf: true, msgId: "m555", cliMsgId: "555", kind: "photo" });
    failedMedia(db, { ...group, msgId: "m666", cliMsgId: "666", kind: "file", checksum: md5(PDF) });
    failedMedia(db, { ...group, msgId: "m777", cliMsgId: "777", kind: "file", checksum: md5("nội dung khác") });
    failedMedia(db, { ...group, msgId: "m888", cliMsgId: "888", kind: "photo" }); // Zalo PC chưa từng tải

    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-media-"));
    const result = await importMediaFromZaloPc({ db, mediaDir, downloadsDir: dl, selfUid: SELF, log: createSilentLogger(), convertJxl: () => PNG });

    assert.deepEqual(result, { total: 8, processed: 8, recovered: 6, notFound: 1, rejected: 1, failed: 0 });
    const row = (msgId: string) =>
      db.prepare("SELECT status, local_path, mime, recovered_from, last_error FROM attachments WHERE msg_id = ?").get(msgId) as Record<string, string | null>;
    const ext = (msgId: string) => path.extname(String(row(msgId).local_path));
    assert.deepEqual([row("m111").status, row("m111").recovered_from, row("m111").last_error], ["done", "zalo_pc", null]);
    assert.deepEqual([ext("m111"), ext("m222"), ext("m333"), ext("m444"), ext("m555"), ext("m666")], [".jpg", ".png", ".jpg", ".mp4", ".jpg", ".pdf"]);
    // Ảnh có bản xem trước: bản gốc HD giữ cạnh; ảnh chỉ có JXL: đổi PNG, JXL giữ cạnh
    const main111 = path.join(mediaDir, String(row("m111").local_path));
    assert.deepEqual(fs.readFileSync(main111), JPEG("xem trước 111"));
    assert.deepEqual(fs.readFileSync(main111.replace(/\.jpg$/, ".orig.jxl")), JXL("gốc 111"));
    assert.ok(fs.existsSync(path.join(mediaDir, String(row("m222").local_path)).replace(/\.png$/, ".jxl")));
    assert.deepEqual(fs.readFileSync(path.join(mediaDir, String(row("m333").local_path))), JPEG("gốc 333"), "bản xem trước hỏng thì dùng bản gốc");
    assert.deepEqual([row("m777").status, row("m888").status], ["failed", "failed"], "sai MD5 / không có bản thì giữ nguyên");
    assert.deepEqual(fs.readdirSync(path.join(mediaDir, ".tmp")), [], "không để lại file tạm");
    assert.deepEqual(snapshot(dl), before, "thư mục Zalo PC không bị đổi gì");

    const again = await importMediaFromZaloPc({ db, mediaDir, downloadsDir: dl, selfUid: SELF, log: createSilentLogger(), convertJxl: () => PNG });
    assert.deepEqual([again.total, again.recovered], [2, 0], "chạy lại chỉ xét file còn hỏng");
  });
});
