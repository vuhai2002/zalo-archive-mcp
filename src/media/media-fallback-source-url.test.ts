import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { fallbackSourceUrl } from "./media-fallback-source-url.js";
import { MediaDownloadWorker } from "./media-download-worker.js";

const ZALO_GIF = "https://media-ten.z-cdn.me/ExampleGif0AAAAM/sample-animation.gif";
const TENOR_GIF = "https://media.tenor.com/ExampleGif0AAAAM/sample-animation.gif";
const GIF_BYTES = Buffer.from("GIF89a-gif-that-tenor-still-has");

describe("bản dự phòng khi link trên CDN Zalo hỏng", () => {
  it("ảnh jpg -> bản JXL gốc; gif bản chép Tenor của Zalo -> Tenor gốc cùng đường dẫn; loại / host khác thì không có", () => {
    assert.deepEqual(fallbackSourceUrl("photo", "https://f1-zpc.zdn.vn/jpg/123/abc.jpg"), { url: "https://f1-zpc.zdn.vn/jxl/123/abc.jxl", label: "JXL" });
    assert.deepEqual(fallbackSourceUrl("gif", ZALO_GIF), { url: TENOR_GIF, label: "Tenor" });
    assert.equal(fallbackSourceUrl("gif", TENOR_GIF), null);
    assert.equal(fallbackSourceUrl("gif", "https://media-ten.z-cdn.me.evil.com/x/a.gif"), null);
    assert.equal(fallbackSourceUrl("video", ZALO_GIF), null);
  });

  it("gif mà Zalo đã xóa bản chép (404): tải bản Tenor gốc; Tenor cũng hỏng thì ghi cả hai lỗi", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(
      db,
      sampleMessage({ msgType: "chat.gif", attachments: [{ kind: "gif", remoteUrl: ZALO_GIF, fileName: null, declaredSize: null }] }),
      { source: "mobile_sync", receivedAt: "2026-11-02T07:00:00.000Z" },
    );
    let tenorUp = true;
    const asked: string[] = [];
    const worker = new MediaDownloadWorker({
      db,
      mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "zam-tenor-")),
      log: createSilentLogger(),
      allowedHostSuffixes: ["media-ten.z-cdn.me", "media.tenor.com"],
      maxBytes: 1024,
      maxAttempts: 1,
      downloadTimeoutMs: 60_000,
      fetchImpl: (async (url: string) => {
        asked.push(String(url));
        return String(url) === TENOR_GIF && tenorUp
          ? new Response(GIF_BYTES, { headers: { "content-type": "image/gif" } })
          : new Response("", { status: 404 });
      }) as unknown as typeof fetch,
      now: () => new Date("2026-11-02T07:30:00.000Z"),
    });
    const row = () => db.prepare("SELECT status, mime, size_bytes, last_error FROM attachments").get() as Record<string, unknown>;

    await worker.tick();
    assert.deepEqual(asked, [ZALO_GIF, TENOR_GIF]);
    assert.deepEqual([row().status, row().mime, row().size_bytes], ["done", "image/gif", GIF_BYTES.length]);

    tenorUp = false;
    db.prepare("UPDATE attachments SET status = 'pending', attempts = 0, local_path = NULL").run();
    await worker.tick();
    assert.equal(row().status, "failed");
    assert.match(String(row().last_error), /HTTP 404 \(bản Tenor: HTTP 404\)/);
  });
});
