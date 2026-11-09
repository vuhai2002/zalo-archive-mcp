import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { imageSize } from "../media/image-dimensions.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getOutboxItem, type OutboxItem } from "../storage/outbox-store.js";
import { secretFileReason } from "./blocked-secret-files.js";
import { enqueueSingle } from "./enqueue-outbox-request.js";
import { OutboxSender } from "./outbox-sender-loop.js";
import { sentMsgIdOf, toAttachmentSources } from "./outbox-zalo-attachments.js";
import { resolveOutboxFiles } from "./resolve-outbox-files.js";

const env = parseEnv({});
const NOW = new Date("2026-11-09T13:00:00.000Z");
/** PNG 3x2: chữ ký + khối IHDR */
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.from("000000030000000208060000001f15c489", "hex")]);

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kho-file-"));
  const dataDir = path.join(root, "data");
  const mediaRoot = path.join(dataDir, "accounts", "1", "media");
  fs.mkdirSync(path.join(mediaRoot, "9f"), { recursive: true });
  fs.writeFileSync(path.join(mediaRoot, "9f", "9f57.xlsx"), "bang tinh");
  fs.writeFileSync(path.join(dataDir, "accounts", "1", "archive.db"), "db");
  const docs = path.join(root, "Documents");
  fs.mkdirSync(path.join(docs, ".ssh"), { recursive: true });
  fs.writeFileSync(path.join(docs, "bao-gia.pdf"), "pdf");
  fs.writeFileSync(path.join(docs, "anh.png"), PNG);
  fs.writeFileSync(path.join(docs, ".env"), "SECRET=1");
  fs.writeFileSync(path.join(docs, ".ssh", "config"), "Host x");
  const db = openArchiveDatabase(":memory:");
  upsertMessage(
    db,
    sampleMessage({ msgId: "100", threadId: "g-1", threadType: "group", attachments: [{ kind: "file", remoteUrl: "https://f.zdn.vn/a.xlsx", fileName: "bang-tinh.xlsx", declaredSize: 9 }] }),
    { source: "live", receivedAt: NOW.toISOString() },
  );
  db.prepare("UPDATE attachments SET status = 'done', local_path = '9f/9f57.xlsx'").run();
  const attId = (db.prepare("SELECT id FROM attachments LIMIT 1").get() as { id: number }).id;
  return { root, db, docs, dirs: { mediaRoot, dataDir }, attId };
}

describe("gửi file qua kho", () => {
  it("chặn cứng file bí mật; file mẫu .env.example và file thường thì cho", () => {
    for (const p of ["C:\\x\\.env", "/a/.env.production", "/a/id_rsa", "/a/server.pem", "/a/k.kdbx", "/h/.ssh/config", "/a/.npmrc", "/a/credentials.enc"]) {
      assert.ok(secretFileReason(p), p);
    }
    for (const p of ["/a/.env.example", "/a/bao-gia.pdf", "/a/id_rsa.pub", "C:\\Users\\a\\Downloads\\anh.jpg"]) assert.equal(secretFileReason(p), null, p);
  });

  it("đường dẫn trên máy + file trong kho (tên gốc); từ chối: tương đối, không có, bí mật, dữ liệu nội bộ kho, quá 10 file", () => {
    const s = setup();
    const ok = resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.docs, "bao-gia.pdf"), path.join(s.docs, "anh.png")], attachmentIds: [s.attId] });
    assert.ok("files" in ok);
    assert.deepEqual(
      ok.files.map((f) => [f.name, f.kind, f.size]),
      [["bao-gia.pdf", "file", 3], ["anh.png", "image", PNG.length], ["bang-tinh.xlsx", "file", 9]],
    );
    const err = (r: ReturnType<typeof resolveOutboxFiles>) => ("error" in r ? r.error : "");
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { paths: ["bao-gia.pdf"] })), /tuyệt đối/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.docs, "khong-co.pdf")] })), /không thấy file/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.docs, ".env")] })), /bị chặn: file biến môi trường/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.docs, ".ssh", "config")] })), /thư mục cất khóa/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.dirs.dataDir, "accounts", "1", "archive.db")] })), /dữ liệu nội bộ của kho/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, { attachmentIds: Array.from({ length: 11 }, (_, i) => i + 1) })), /tối đa 10 file/);
    assert.match(err(resolveOutboxFiles(s.db, s.dirs, {})), /Chưa có file/);
    fs.rmSync(s.root, { recursive: true, force: true });
  });

  it("đọc cỡ ảnh PNG / GIF / JPEG / WebP từ phần đầu file; không phải ảnh thì null", () => {
    assert.deepEqual(imageSize(PNG), { width: 3, height: 2 });
    assert.deepEqual(imageSize(Buffer.from("GIF89a\x05\x00\x04\x00", "latin1")), { width: 5, height: 4 });
    const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108000700090301", "hex");
    assert.deepEqual(imageSize(jpeg), { width: 9, height: 7 });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBPVP8X", 8, "ascii");
    webp.writeUIntLE(639, 24, 3);
    webp.writeUIntLE(479, 27, 3);
    assert.deepEqual(imageSize(webp), { width: 640, height: 480 });
    assert.equal(imageSize(Buffer.from("not an image")), null);
  });

  it("đưa zca-js dữ liệu + tên gốc + cỡ ảnh (không đưa đường dẫn); mã tin lấy tin chữ trước, không thì file đầu", async () => {
    const s = setup();
    const r = resolveOutboxFiles(s.db, s.dirs, { paths: [path.join(s.docs, "anh.png")], attachmentIds: [s.attId] });
    assert.ok("files" in r);
    const sources = await toAttachmentSources(r.files);
    assert.deepEqual(
      sources.map((x) => (typeof x === "string" ? x : [x.filename, x.metadata])),
      [["anh.png", { totalSize: PNG.length, width: 3, height: 2 }], ["bang-tinh.xlsx", { totalSize: 9 }]],
    );
    fs.rmSync(path.join(s.docs, "anh.png"));
    await assert.rejects(toAttachmentSources(r.files), /Không đọc được file "anh.png"/);
    assert.equal(sentMsgIdOf({ message: { msgId: 11 }, attachment: [{ msgId: 12 }] }), "11");
    assert.equal(sentMsgIdOf({ message: null, attachment: [{ msgId: 12 }] }), "12");
    fs.rmSync(s.root, { recursive: true, force: true });
  });

  it("hàng đợi giữ file, chú thích không bắt buộc; daemon gửi bằng đường gửi file, không giả đang soạn", async () => {
    const s = setup();
    const r = resolveOutboxFiles(s.db, s.dirs, { attachmentIds: [s.attId] });
    assert.ok("files" in r);
    const q = enqueueSingle({ db: s.db, env, readOnly: false }, { threadId: "g-1", text: "  ", files: r.files, when: "now", createdBy: "mcp" });
    assert.equal(q.ok, true);
    const calls: string[] = [];
    const sender = new OutboxSender({
      db: s.db,
      env,
      log: createSilentLogger(),
      sendText: async () => ({ msgId: "x" }),
      forwardText: async () => ({ msgId: "x" }),
      sendFiles: async (item: OutboxItem) => {
        calls.push(`file ${item.threadId}: ${item.files.map((f) => f.name).join(",")} "${item.text}"`);
        return { msgId: "777" };
      },
      sendTyping: async () => void calls.push("đang soạn"),
      sleep: async () => {},
      isListenerConnected: () => true,
      isReadOnly: () => false,
      now: () => NOW,
      random: () => 0,
    });
    await sender.tick();
    assert.deepEqual(calls, ['file g-1: bang-tinh.xlsx ""']);
    assert.equal(getOutboxItem(s.db, 1)!.sentMsgId, "777");
    fs.rmSync(s.root, { recursive: true, force: true });
  });
});
