import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getMeta } from "../storage/thread-directory-store.js";
import { DELETED_BY_ZALO_ERROR, isDeletedByZalo, markAttachmentDeletedByZalo } from "../storage/zalo-deleted-media-store.js";
import { readThread } from "../storage/message-read-queries.js";
import { toAttachmentInfo } from "../dashboard/dashboard-dto-mappers.js";
import { MediaDownloadWorker } from "./media-download-worker.js";
import { MediaLinkRenewer } from "./media-link-renewer.js";

const NOW = new Date("2026-10-31T06:00:00.000Z");
const live = { source: "mobile_sync" as const, receivedAt: NOW.toISOString() };
type Db = ReturnType<typeof openArchiveDatabase>;

/** Một tin có một file, gửi lúc `sentAt`; trả id file */
function addMedia(db: Db, msgId: string, sentAt: string, kind: "photo" | "video" = "photo"): number {
  upsertMessage(
    db,
    sampleMessage({
      msgId,
      cliMsgId: `c${msgId}`,
      sentAt,
      msgType: kind === "photo" ? "chat.photo" : "chat.video.msg",
      text: "",
      rawJson: "{}",
      attachments: [{ kind, remoteUrl: `https://photo-stal.zdn.vn/${msgId}.jpg`, fileName: null, declaredSize: null }],
    }),
    live,
  );
  return (db.prepare("SELECT id FROM attachments WHERE msg_id = ?").get(msgId) as { id: number }).id;
}

const refuse = (db: Db, id: number) =>
  db
    .prepare("UPDATE attachments SET status = 'failed', renewed_at = ?, last_error = ? WHERE id = ?")
    .run(NOW.toISOString(), "Link hết hạn, Zalo không cấp lại link mới (mã lỗi 1001)", id);

/** Ba ảnh gửi 14-16/10 đã bị Zalo từ chối cấp lại link */
function withRefusedPhotos(db: Db) {
  ["2026-10-14T03:00:00.000Z", "2026-10-15T03:00:00.000Z", "2026-10-16T03:00:00.000Z"].forEach((at, i) => refuse(db, addMedia(db, `r${i}`, at)));
}

describe("bỏ qua file Zalo đã xóa khi xin lại link", () => {
  it("file cùng loại mới hơn đã bị từ chối đủ 3 lần thì file cũ hơn coi là Zalo đã xóa", () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    assert.equal(isDeletedByZalo(db, addMedia(db, "old", "2026-10-10T03:00:00.000Z"), NOW), true);
    assert.equal(isDeletedByZalo(db, addMedia(db, "mid", "2026-10-15T12:00:00.000Z"), NOW), false, "mới chỉ 1 file mới hơn bị từ chối");
    assert.equal(isDeletedByZalo(db, addMedia(db, "new", "2026-10-20T03:00:00.000Z"), NOW), false, "mới hơn mọi file bị từ chối");
    assert.equal(isDeletedByZalo(db, addMedia(db, "vid", "2026-10-10T03:00:00.000Z", "video"), NOW), false, "khác loại file");
  });

  it("chưa đủ 3 lần từ chối, hoặc 7 ngày qua còn xin lại được file cũ hơn, thì vẫn thử", () => {
    const two = openArchiveDatabase(":memory:");
    ["2026-10-15T03:00:00.000Z", "2026-10-16T03:00:00.000Z"].forEach((at, i) => refuse(two, addMedia(two, `r${i}`, at)));
    assert.equal(isDeletedByZalo(two, addMedia(two, "old", "2026-10-10T03:00:00.000Z"), NOW), false);

    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    const ok = addMedia(db, "ok", "2026-10-05T03:00:00.000Z");
    db.prepare("UPDATE attachments SET original_url = remote_url, renewed_at = ?, status = 'done' WHERE id = ?").run("2026-10-30T00:00:00.000Z", ok);
    assert.equal(isDeletedByZalo(db, addMedia(db, "old", "2026-10-10T03:00:00.000Z"), NOW), false);
  });

  it("ảnh cũ 404: đóng luôn là Zalo đã xóa, không gọi Zalo, không tốn lượt; lúc khởi động đóng cả file đang chờ lượt", async () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    const old = addMedia(db, "old", "2026-10-10T03:00:00.000Z");
    const calls: unknown[] = [];
    const renewer = new MediaLinkRenewer({
      db,
      call: async (input) => (calls.push(input), {}),
      pacing: { minGapSeconds: 4, maxGapSeconds: 10, dailyCap: 200, timeZone: "Asia/Ho_Chi_Minh" },
      log: createSilentLogger(),
      random: () => 0,
    });
    const worker = new MediaDownloadWorker({
      db,
      mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "zam-deleted-")),
      log: createSilentLogger(),
      allowedHostSuffixes: ["zdn.vn"],
      maxBytes: 1024,
      maxAttempts: 3,
      downloadTimeoutMs: 60_000,
      fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
      now: () => NOW,
      renewer,
    });
    await worker.tick();
    const row = db.prepare("SELECT status, needs_renew, last_error FROM attachments WHERE id = ?").get(old);
    assert.deepEqual([row?.status, row?.needs_renew, row?.last_error], ["failed", 0, DELETED_BY_ZALO_ERROR]);
    assert.equal(calls.length, 0);
    assert.equal(getMeta(db, "media_renew_schedule"), null, "không cấp lượt xin lại nào");

    // File đã xếp lượt từ trước khi kho biết Zalo xóa: lúc khởi động đóng luôn; file mới hơn vẫn chờ
    const queued = addMedia(db, "queued", "2026-10-11T03:00:00.000Z");
    const fresh = addMedia(db, "fresh", "2026-10-25T03:00:00.000Z");
    db.prepare("UPDATE attachments SET needs_renew = 1, next_attempt_at = '2026-11-01T00:00:00.000Z' WHERE id IN (?, ?)").run(queued, fresh);
    renewer.requeueExpired(NOW);
    const status = (id: number) => db.prepare("SELECT status, needs_renew FROM attachments WHERE id = ?").get(id);
    assert.deepEqual([status(queued)?.status, status(fresh)?.status, status(fresh)?.needs_renew], ["failed", "pending", 1]);
  });

  it("tin cũ hơn mốc ngày (đồng bộ toàn bộ lịch sử): Zalo đã xóa thì đóng luôn, không gọi máy chủ; tin mới hơn mốc, sticker, hay tắt mốc thì vẫn tải", async () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    const ancient = addMedia(db, "ancient", "2024-05-01T03:00:00.000Z");
    const recent = addMedia(db, "recent", "2026-10-01T03:00:00.000Z"); // 30 ngày tuổi: dưới mốc 40 ngày
    upsertMessage(
      db,
      sampleMessage({
        msgId: "stk",
        sentAt: "2024-05-01T04:00:00.000Z",
        msgType: "chat.sticker",
        attachments: [{ kind: "sticker", remoteUrl: "https://zalo-api.zadn.vn/stk.webp", fileName: null, declaredSize: null }],
      }),
      live,
    );
    const fetched: string[] = [];
    const worker = (assumeDeletedAfterDays: number) =>
      new MediaDownloadWorker({
        db,
        mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "zam-old-")),
        log: createSilentLogger(),
        allowedHostSuffixes: ["zdn.vn", "zadn.vn"],
        maxBytes: 1024,
        maxAttempts: 1,
        downloadTimeoutMs: 60_000,
        fetchImpl: (async (url: string) => (fetched.push(String(url)), new Response("", { status: 404 }))) as unknown as typeof fetch,
        now: () => NOW,
        assumeDeletedAfterDays,
      });
    const status = (id: number) => db.prepare("SELECT status, last_error FROM attachments WHERE id = ?").get(id);

    const w = worker(40);
    assert.equal(await w.tick(), 0, "đóng không cần chờ: hàng đợi dọn nhanh");
    assert.deepEqual([status(ancient)?.status, status(ancient)?.last_error], ["failed", DELETED_BY_ZALO_ERROR]);
    assert.equal(fetched.length, 0, "không gọi máy chủ");
    await w.tick();
    await w.tick();
    assert.deepEqual(fetched.map((u) => u.split("/").at(-1)), ["recent.jpg", "stk.webp"], "dưới mốc ngày và sticker vẫn thử tải");

    const off = addMedia(db, "off", "2024-05-02T03:00:00.000Z");
    await worker(0).tick();
    assert.ok(fetched.at(-1)?.includes("/off"), "tắt mốc (0) thì luôn thử tải");
    assert.notEqual(status(off)?.last_error, DELETED_BY_ZALO_ERROR);
    assert.equal(status(recent)?.status, "failed");
  });

  it("file cũ đã đóng rồi bị đưa lại hàng đợi vẫn đóng ngay, không tải; file Zalo đã cấp link mới thì vẫn tải", async () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    // Bị đưa về hàng đợi sau khi đã đóng: dấu "đã xin lại link" (renewed_at) vẫn còn
    const requeued = addMedia(db, "requeued", "2024-05-01T03:00:00.000Z");
    markAttachmentDeletedByZalo(db, requeued, NOW);
    db.prepare("UPDATE attachments SET status = 'pending', attempts = 0, last_error = NULL WHERE id = ?").run(requeued);
    // Zalo từng cấp link mới (10 ngày trước), lần tải bằng link đó chưa xong
    const renewed = addMedia(db, "renewed", "2024-05-02T03:00:00.000Z");
    db.prepare("UPDATE attachments SET original_url = remote_url, remote_url = 'https://photo-stal.zdn.vn/renewed-new.jpg', renewed_at = ? WHERE id = ?").run(
      new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
      renewed,
    );
    const fetched: string[] = [];
    const w = new MediaDownloadWorker({
      db,
      mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "zam-requeued-")),
      log: createSilentLogger(),
      allowedHostSuffixes: ["zdn.vn"],
      maxBytes: 1024,
      maxAttempts: 1,
      downloadTimeoutMs: 60_000,
      fetchImpl: (async (url: string) => (fetched.push(String(url)), new Response("", { status: 404 }))) as unknown as typeof fetch,
      now: () => NOW,
      assumeDeletedAfterDays: 40,
    });
    await w.tick();
    await w.tick();
    const row = db.prepare("SELECT status, last_error FROM attachments WHERE id = ?").get(requeued);
    assert.deepEqual([row?.status, row?.last_error], ["failed", DELETED_BY_ZALO_ERROR]);
    assert.deepEqual(fetched.map((u) => u.split("/").at(-1)), ["renewed-new.jpg"]);
  });

  it("dashboard biết file Zalo đã xóa (đóng luôn hoặc bị từ chối 1001) để hiện 'Ảnh đã hết hạn', file hỏng khác thì không", () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db);
    const closed = addMedia(db, "closed", "2026-10-10T03:00:00.000Z");
    markAttachmentDeletedByZalo(db, closed, NOW);
    const other = addMedia(db, "other", "2026-10-29T03:00:00.000Z");
    db.prepare("UPDATE attachments SET status = 'failed', renewed_at = ?, last_error = 'Link đã xin lại vẫn hỏng: HTTP 404' WHERE id = ?").run(NOW.toISOString(), other);
    const states = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 }).map((m) => [m.msgId, toAttachmentInfo(m.attachments[0]!).renewState]);
    assert.deepEqual(states, [
      ["closed", "deleted"],
      ["r0", "deleted"],
      ["r1", "deleted"],
      ["r2", "deleted"],
      ["other", "gave_up"],
    ]);
  });

  it("khởi động: lượt của file vừa đóng được trả lại, hàng chờ còn lại cấp lượt mới - tin mới nhất trước, vẫn giữ trần ngày", () => {
    const db = openArchiveDatabase(":memory:");
    withRefusedPhotos(db); // 3 lệnh đã gửi Zalo hôm nay (31/10 giờ VN): trần 3/ngày là đã hết
    const old = addMedia(db, "old", "2026-10-10T03:00:00.000Z");
    const a = addMedia(db, "a", "2026-10-25T03:00:00.000Z");
    const b = addMedia(db, "b", "2026-10-28T03:00:00.000Z");
    // Trước khi biết Zalo xóa file cũ: lượt đã cấp dồn tới tận 05/11
    db.prepare("UPDATE attachments SET needs_renew = 1, next_attempt_at = ? WHERE id = ?").run("2026-11-04T01:00:00.000Z", old);
    db.prepare("UPDATE attachments SET needs_renew = 1, next_attempt_at = ? WHERE id = ?").run("2026-11-05T01:00:00.000Z", a);
    db.prepare("UPDATE attachments SET needs_renew = 1, next_attempt_at = ? WHERE id = ?").run("2026-11-05T01:00:10.000Z", b);
    const renewer = new MediaLinkRenewer({
      db,
      call: async () => ({}),
      pacing: { minGapSeconds: 4, maxGapSeconds: 10, dailyCap: 3, timeZone: "Asia/Ho_Chi_Minh" },
      log: createSilentLogger(),
      random: () => 0,
    });
    renewer.requeueExpired(NOW);
    const slot = (id: number) => String(db.prepare("SELECT next_attempt_at AS t FROM attachments WHERE id = ?").get(id)?.t);
    assert.equal(db.prepare("SELECT status FROM attachments WHERE id = ?").get(old)?.status, "failed");
    // Hôm nay hết trần nên sang 00:00 ngày 01/11 giờ VN (31/10 17:00 UTC); ảnh 28/10 (mới hơn) trước ảnh 25/10
    assert.ok(slot(b) < slot(a), "tin mới hơn được lượt trước");
    assert.ok(slot(b) >= "2026-10-31T17:00:00.000Z" && slot(a) < "2026-11-01T00:00:00.000Z", `lượt vào ngày mai, không chờ tới 05/11: ${slot(b)} ${slot(a)}`);
  });
});
