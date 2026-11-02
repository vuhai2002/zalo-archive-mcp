import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { getAttachment, requeueJxlRecoverablePhotos } from "../storage/attachment-queue-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { DELETED_BY_ZALO_ERROR } from "../storage/zalo-deleted-media-store.js";
import { MediaDownloadWorker } from "./media-download-worker.js";
import { convertJxlToPng, looksLikeJxl, zaloJxlVariantUrl } from "./zalo-jxl-photo.js";

const JPG_URL = "https://f119-zpc.zdn.vn/jpg/2120000000000000112/0a1b2c3d4e5f6a7b8c9d.jpg";
const JXL_URL = "https://f119-zpc.zdn.vn/jxl/2120000000000000112/0a1b2c3d4e5f6a7b8c9d.jxl";
const JXL_BYTES = Buffer.from([0xff, 0x0a, 1, 2, 3, 4, 5, 6]);
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);

/** Một tin ảnh link JPG zpc; `routes` quyết định CDN trả gì cho từng URL */
function setup(routes: Record<string, () => Response>) {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage({ msgType: "chat.photo", attachments: [{ kind: "photo", remoteUrl: JPG_URL, fileName: null, declaredSize: null }] }), {
    source: "live",
    receivedAt: "2026-03-09T01:00:59.000Z",
  });
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    return routes[url]?.() ?? new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-jxl-"));
  const worker = new MediaDownloadWorker({
    db,
    mediaDir,
    log: createSilentLogger(),
    allowedHostSuffixes: ["zdn.vn"],
    maxBytes: 10_000,
    maxAttempts: 1,
    downloadTimeoutMs: 60_000,
    fetchImpl,
    now: () => new Date("2026-10-29T03:30:00.000Z"),
    convertJxl: () => FAKE_PNG,
  });
  return { db, worker, mediaDir, asked, att: () => getAttachment(db, 1)! };
}

describe("ảnh JPEG XL của Zalo", () => {
  it("đổi link JPG trên CDN ảnh Zalo sang bản JXL; link khác thì không", () => {
    assert.equal(zaloJxlVariantUrl(JPG_URL), JXL_URL);
    assert.equal(zaloJxlVariantUrl("https://photo-stal-20.zdn.vn/no/jpg/abc/def.jpg"), null);
    assert.equal(zaloJxlVariantUrl("https://evil.example.com/jpg/a/b.jpg"), null);
    assert.equal(zaloJxlVariantUrl("không phải url"), null);
  });

  it("nhận ra file JXL theo mime hoặc chữ ký đầu file; dữ liệu rác thì báo lỗi giải mã, không treo", () => {
    assert.equal(looksLikeJxl("image/jxl", new Uint8Array(16)), true);
    assert.equal(looksLikeJxl(null, new Uint8Array([0xff, 0x0a])), true);
    assert.equal(looksLikeJxl(null, new Uint8Array([0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])), true);
    assert.equal(looksLikeJxl("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])), false);
    assert.throws(() => convertJxlToPng(new Uint8Array([1, 2, 3, 4])));
  });

  it("JPG hỏng (500) mà còn bản JXL: tải JXL, lưu PNG làm file chính, giữ .jxl gốc cạnh đó", async () => {
    const s = setup({
      [JPG_URL]: () => new Response("", { status: 500 }),
      [JXL_URL]: () => new Response(JXL_BYTES, { headers: { "content-type": "image/jxl" } }),
    });
    await s.worker.tick();
    const a = s.att();
    assert.deepEqual(s.asked, [JPG_URL, JXL_URL]);
    assert.equal(a.status, "done");
    assert.equal(a.mime, "image/png");
    assert.match(String(a.local_path), /\.png$/);
    assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(s.mediaDir, String(a.local_path)))), FAKE_PNG);
    const original = path.join(s.mediaDir, String(a.local_path).replace(/\.png$/, ".jxl"));
    assert.deepEqual(fs.readFileSync(original), JXL_BYTES);
  });

  it("JPG tải được thì không đụng tới JXL", async () => {
    const s = setup({ [JPG_URL]: () => new Response("anh-jpg", { headers: { "content-type": "image/jpeg" } }) });
    await s.worker.tick();
    assert.deepEqual(s.asked, [JPG_URL]);
    assert.equal(s.att().mime, "image/jpeg");
  });

  it("cả JPG lẫn JXL đều hỏng: lỗi ghi rõ đã thử JXL, khởi động lại không xếp lại ảnh đó nữa", async () => {
    const s = setup({ [JPG_URL]: () => new Response("", { status: 500 }) });
    await s.worker.tick();
    assert.equal(s.att().status, "failed");
    assert.match(String(s.att().last_error), /HTTP 500 \(bản JXL: HTTP 404\)/);
    assert.equal(requeueJxlRecoverablePhotos(s.db), 0);

    // Ảnh hỏng từ trước khi biết thử JXL (lỗi chỉ có "HTTP 500") thì được xếp lại một lần
    s.db.prepare("UPDATE attachments SET last_error = 'HTTP 500' WHERE id = 1").run();
    assert.equal(requeueJxlRecoverablePhotos(s.db), 1);
    assert.equal(s.att().status, "pending");

    // Ảnh đã qua bước xin lại link (Zalo đã xóa, bị từ chối, xin lại không được) thì không xếp lại
    s.db.prepare("UPDATE attachments SET status = 'failed', last_error = ?, renewed_at = '2026-11-02T05:00:00.000Z' WHERE id = 1").run(DELETED_BY_ZALO_ERROR);
    assert.equal(requeueJxlRecoverablePhotos(s.db), 0);
  });
});
