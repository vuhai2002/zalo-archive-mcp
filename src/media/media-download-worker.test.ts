import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { getAttachment, requeueNowAllowedAttachments } from "../storage/attachment-queue-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { isAllowedMediaHost } from "./media-file-naming.js";
import { MediaDownloadWorker } from "./media-download-worker.js";

const HOSTS = ["zdn.vn", "zalo.me"];
const NOW = new Date("2026-10-28T03:00:00.000Z");

function setup(url: string, fetchImpl: typeof fetch, opts: { maxBytes?: number; maxAttempts?: number } = {}) {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(
    db,
    sampleMessage({ attachments: [{ kind: "file", remoteUrl: url, fileName: "báo cáo.pdf", declaredSize: null }] }),
    { source: "live", receivedAt: NOW.toISOString() },
  );
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-media-"));
  const worker = new MediaDownloadWorker({
    db,
    mediaDir,
    log: createSilentLogger(),
    allowedHostSuffixes: HOSTS,
    maxBytes: opts.maxBytes ?? 1024,
    maxAttempts: opts.maxAttempts ?? 3,
    downloadTimeoutMs: 60_000,
    fetchImpl,
    now: () => NOW,
  });
  return { db, worker, mediaDir, att: () => getAttachment(db, 1)! };
}

const respond = (body: string, init: ResponseInit = {}) => (async () => new Response(body, init)) as unknown as typeof fetch;

describe("MediaDownloadWorker", () => {
  it("tải về, lưu theo sha256 với đuôi lấy từ tên file, đánh done", async () => {
    const { worker, mediaDir, att } = setup("https://f1.dlfl.zdn.vn/a", respond("%PDF-1.4 nội dung", { headers: { "content-type": "application/pdf" } }));
    await worker.tick();
    const a = att();
    assert.equal(a.status, "done");
    const sha = crypto.createHash("sha256").update("%PDF-1.4 nội dung").digest("hex");
    assert.equal(a.sha256, sha);
    assert.equal(a.local_path, `${sha.slice(0, 2)}/${sha}.pdf`);
    assert.ok(fs.existsSync(path.join(mediaDir, String(a.local_path))));
  });

  it("host lạ bị chặn, kể cả khi CDN chuyển hướng ra host lạ", async () => {
    const direct = setup("https://evil.example.com/x", respond("x"));
    await direct.worker.tick();
    assert.equal(direct.att().status, "blocked_host");

    const redirect = setup("https://f1.zdn.vn/a", respond("", { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    await redirect.worker.tick();
    assert.equal(redirect.att().status, "blocked_host");
  });

  it("vượt trần cỡ: too_large, không để lại file", async () => {
    const { worker, mediaDir, att } = setup("https://f1.zdn.vn/a", respond("x".repeat(2000)), { maxBytes: 1000 });
    await worker.tick();
    assert.equal(att().status, "too_large");
    assert.deepEqual(fs.readdirSync(path.join(mediaDir, ".tmp")), []);
  });

  it("lỗi tạm thời thì hẹn thử lại; hết lượt thì đóng hẳn; 404 đóng ngay", async () => {
    const flaky = setup("https://f1.zdn.vn/a", respond("", { status: 503 }), { maxAttempts: 2 });
    await flaky.worker.tick();
    assert.equal(flaky.att().status, "pending");
    assert.equal(await flaky.worker.tick(), 10_000, "chưa tới giờ thử lại thì không giành");
    flaky.db.prepare("UPDATE attachments SET next_attempt_at = NULL").run();
    await flaky.worker.tick();
    assert.equal(flaky.att().status, "failed");

    const gone = setup("https://f1.zdn.vn/a", respond("", { status: 404 }));
    await gone.worker.tick();
    assert.equal(gone.att().status, "failed");
  });

  it("CDN trả 200 mà rỗng (ảnh vừa gửi chưa lên CDN): chưa xong, hẹn thử lại; lần sau có ảnh thì done", async () => {
    let body = "";
    const cdn = (async () => new Response(body, { headers: { "content-type": "image/jpg" } })) as unknown as typeof fetch;
    const { worker, db, mediaDir, att } = setup("https://photo-stal-35.zdn.vn/gr/jpg/a", cdn);
    await worker.tick();
    assert.equal(att().status, "pending", "file rỗng không được đánh done");
    assert.match(String(att().last_error), /rỗng/);
    assert.deepEqual(fs.readdirSync(path.join(mediaDir, ".tmp")), [], "không để lại file tạm rỗng");
    body = "ảnh thật";
    db.prepare("UPDATE attachments SET next_attempt_at = NULL").run();
    await worker.tick();
    assert.deepEqual([att().status, att().size_bytes], ["done", Buffer.byteLength("ảnh thật")]);
  });

  it("file từng bị chặn vì host, nay host được phép: đưa về hàng đợi tải lại", async () => {
    const { db, worker, att } = setup("https://file-stal-21.dlfl.vn/gr/x", respond("x"));
    await worker.tick();
    assert.equal(att().status, "blocked_host");
    const n = requeueNowAllowedAttachments(db, (url) => isAllowedMediaHost(url, [...HOSTS, "dlfl.vn"]));
    assert.equal(n, 1);
    assert.equal(att().status, "pending");
  });

  it("isAllowedMediaHost: khớp đúng đuôi tên miền, không bị lừa bởi tiền tố", () => {
    assert.equal(isAllowedMediaHost("https://f21-zpc.zdn.vn/x.jpg", HOSTS), true);
    assert.equal(isAllowedMediaHost("https://zdn.vn/x", HOSTS), true);
    assert.equal(isAllowedMediaHost("https://evilzdn.vn/x", HOSTS), false);
    assert.equal(isAllowedMediaHost("https://zdn.vn.evil.com/x", HOSTS), false);
    assert.equal(isAllowedMediaHost("https://user:pass@f1.zdn.vn/x", HOSTS), false);
    assert.equal(isAllowedMediaHost("file:///etc/passwd", HOSTS), false);
  });
});
