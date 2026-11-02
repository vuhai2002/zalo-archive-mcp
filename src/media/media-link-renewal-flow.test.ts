import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { requestAttachmentRetry } from "../storage/attachment-renewal-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { RenewLinkReplyWaiter } from "../zalo/renew-link-control-listener.js";
import type { RenewMediaLinkInput } from "../zalo/zca-renew-media-link-api.js";
import { MediaDownloadWorker } from "./media-download-worker.js";
import { MediaLinkRenewer, zaloErrorText } from "./media-link-renewer.js";
import { isZaloDeletedFailure } from "../storage/zalo-deleted-media-store.js";

const OLD = "https://f1.dlfl.vn/old/tai-lieu-mau.pdf";
const NEW = "https://f1.dlfl.vn/new/tai-lieu-mau.pdf";
const T0 = new Date("2026-10-29T08:00:00.000Z");
const pdf = () => new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } });

/** Kho có một tin file; CDN trả theo bảng `routes`; renewlink giả trả `renewReply` */
function setup(
  routes: Record<string, () => Response>,
  renewReply: unknown = { fileUrl: NEW },
  opts: { replies?: RenewLinkReplyWaiter; afterCall?: () => void; dailyCap?: number } = {},
) {
  const db = openArchiveDatabase(":memory:");
  const raw = JSON.stringify({ msgType: "share.file", content: { href: OLD, title: "báo cáo.pdf" } });
  upsertMessage(
    db,
    sampleMessage({
      msgType: "share.file",
      cliMsgId: "1700000000103",
      rawJson: raw,
      attachments: [{ kind: "file", remoteUrl: OLD, fileName: "báo cáo.pdf", declaredSize: null }],
    }),
    { source: "mobile_sync", receivedAt: T0.toISOString() },
  );
  const calls: RenewMediaLinkInput[] = [];
  let clock = T0;
  const renewer = new MediaLinkRenewer({
    db,
    call: async (input) => (calls.push(input), opts.afterCall?.(), renewReply),
    replies: opts.replies,
    pacing: { minGapSeconds: 4, maxGapSeconds: 10, dailyCap: opts.dailyCap ?? 200, timeZone: "Asia/Ho_Chi_Minh" },
    log: createSilentLogger(),
    random: () => 0,
  });
  const worker = new MediaDownloadWorker({
    db,
    mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "zam-renew-")),
    log: createSilentLogger(),
    allowedHostSuffixes: ["dlfl.vn"],
    maxBytes: 1024,
    maxAttempts: 3,
    downloadTimeoutMs: 60_000,
    fetchImpl: (async (url: string) => (routes[url] ?? (() => new Response("", { status: 404 })))()) as unknown as typeof fetch,
    now: () => clock,
    renewer,
  });
  const row = () =>
    db.prepare("SELECT status, remote_url, original_url, needs_renew, renewed_at, last_error, next_attempt_at FROM attachments").get() as Record<
      string,
      unknown
    >;
  return { db, worker, renewer, calls, row, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

describe("xin lại link media hết hạn", () => {
  it("404 thì xếp lượt; tới lượt xin link mới (đúng hội thoại, loại file, link gốc) rồi tải bằng link mới", async () => {
    const t = setup({ [NEW]: pdf });
    await t.worker.tick();
    assert.equal(t.row().status, "pending");
    assert.equal(t.row().needs_renew, 1);
    assert.equal(t.calls.length, 0, "chưa gọi Zalo ngay lúc hỏng");

    await t.worker.tick();
    assert.deepEqual(t.calls, [
      { threadId: "u-lan", isGroup: false, mediaType: 1, msgInfo: { url: OLD, fileName: "báo cáo.pdf", extension: "pdf", fType: 1 } },
    ]);
    const r = t.row();
    assert.deepEqual([r.status, r.remote_url, r.original_url, r.needs_renew], ["done", NEW, OLD, 0]);
  });

  it("Zalo không trả link: hỏng hẳn, khởi động lại không xếp lại; người dùng bấm Thử lại thì xin lần nữa", async () => {
    const t = setup({}, { destId: "u-lan" });
    await t.worker.tick();
    await t.worker.tick();
    assert.equal(t.row().status, "failed");
    assert.match(String(t.row().last_error), /không trả link mới/);
    assert.equal(t.renewer.requeueExpired(T0), 0);

    assert.equal(requestAttachmentRetry(t.db, 1, T0.toISOString()), true);
    t.advance(60_000);
    await t.worker.tick();
    assert.equal(t.calls.length, 2);
  });

  it("Zalo báo lỗi kèm mã (vd mã 1001 mà câu báo là 'Successful.'): ghi cả mã, nhận ra là Zalo đã xóa file", async () => {
    const refused = Object.assign(new Error("Successful."), { code: 1001 });
    const t = setup({}, {}, { afterCall: () => { throw refused; } });
    await t.worker.tick();
    await t.worker.tick();
    const r = t.row();
    assert.equal(r.status, "failed");
    assert.equal(r.last_error, "Link hết hạn, Zalo không cấp lại link mới (mã lỗi 1001 - Successful.)");
    assert.equal(isZaloDeletedFailure(String(r.status), String(r.last_error)), true);
    assert.equal(zaloErrorText(new Error("mạng hỏng")), "mạng hỏng", "lỗi không có mã thì giữ nguyên câu");
  });

  it("link mới vẫn 404: hỏng hẳn, không xin lần hai", async () => {
    const t = setup({});
    await t.worker.tick();
    await t.worker.tick();
    assert.equal(t.calls.length, 1);
    assert.equal(t.row().status, "failed");
    assert.match(String(t.row().last_error), /Link đã xin lại vẫn hỏng: HTTP 404/);
  });

  it("CDN trả 200 kèm mẩu JSON báo hết hạn: coi là link hết hạn, không lưu thành file", async () => {
    const expiredPage = () =>
      new Response('{"error":"signature expired"}', { headers: { "content-type": "application/json", "content-length": "29" } });
    const t = setup({ [OLD]: expiredPage, [NEW]: pdf });
    await t.worker.tick();
    assert.equal(t.row().needs_renew, 1);
    assert.match(String(t.row().last_error), /Link hết hạn \(CDN trả: .*signature expired/);
  });

  it("hai lệnh xin liền nhau: lệnh sau chờ đủ khoảng cách tối thiểu", async () => {
    const t = setup({ [NEW]: pdf });
    const item = { id: 1, msgId: "1000", kind: "file", remoteUrl: OLD, fileName: null, attempts: 1, needsRenew: true, renewedAt: null };
    assert.equal((await t.renewer.renew(item, T0)).kind, "renewed");
    const second = await t.renewer.renew(item, new Date(T0.getTime() + 1_000));
    assert.equal(second.kind, "wait");
    assert.equal(second.kind === "wait" && second.at.getTime() - T0.getTime(), 4_000);
    assert.equal(t.calls.length, 1);
  });

  it("file đã hỏng vì 403/404/410 từ trước: khởi động lại thì xếp lượt xin lại", () => {
    const t = setup({});
    t.db.prepare("UPDATE attachments SET status = 'failed', last_error = 'HTTP 410'").run();
    assert.equal(t.renewer.requeueExpired(T0), 1);
    assert.deepEqual([t.row().status, t.row().needs_renew, t.row().next_attempt_at], ["pending", 1, T0.toISOString()]);
  });
});

describe("xin lại link: loại không hỗ trợ và hẹn trả sau", () => {
  it("Zalo hẹn trả link sau (async): chờ link về qua WebSocket rồi tải; không có kênh chờ thì hỏng với lý do rõ", async () => {
    const replies = new RenewLinkReplyWaiter();
    // Sự kiện renew_link về ngay sau phản hồi HTTP, ghép theo link gốc đã gửi
    const afterCall = () => setTimeout(() => replies.deliver([{ key: OLD, ok: true, bag: { normalUrl: NEW } }]), 5);
    const t = setup({ [NEW]: pdf }, { async: true }, { replies, afterCall });
    await t.worker.tick();
    await t.worker.tick();
    assert.deepEqual([t.row().status, t.row().remote_url], ["done", NEW]);

    const noChannel = setup({}, { async: true });
    await noChannel.worker.tick();
    await noChannel.worker.tick();
    assert.equal(noChannel.calls.length, 1);
    assert.match(String(noChannel.row().last_error), /hẹn trả link sau/);
  });

  it("gif: Zalo không cấp lại link cho loại này - không gọi Zalo", async () => {
    const g = setup({});
    g.db.prepare("UPDATE attachments SET kind = 'gif'").run();
    await g.worker.tick();
    await g.worker.tick();
    assert.equal(g.calls.length, 0);
    assert.match(String(g.row().last_error), /không cấp lại link cho loại file này/);
  });

  it("tin thoại hết hạn: đóng ngay lúc hỏng, không chờ lượt, không tính vào trần ngày", async () => {
    const t = setup({}, { fileUrl: NEW }, { dailyCap: 1 });
    t.db.prepare("UPDATE attachments SET kind = 'voice'").run();
    await t.worker.tick();
    assert.deepEqual([t.row().status, t.row().needs_renew, t.row().next_attempt_at], ["failed", 0, null]);
    assert.match(String(t.row().last_error), /không cấp lại link cho loại file này/);
    assert.equal(t.calls.length, 0);

    // Một file thật đang chờ lượt: trần 1 lượt/ngày vẫn còn nguyên cho nó (tin thoại vừa đóng không phải lệnh gọi Zalo)
    const pdfUrl = "https://f1.dlfl.vn/old/hop-dong.pdf";
    upsertMessage(
      t.db,
      sampleMessage({ msgId: "2000", cliMsgId: "1700000000999", msgType: "share.file", attachments: [{ kind: "file", remoteUrl: pdfUrl, fileName: "hop-dong.pdf", declaredSize: null }] }),
      { source: "mobile_sync", receivedAt: T0.toISOString() },
    );
    t.db.prepare("UPDATE attachments SET status = 'pending', needs_renew = 1, next_attempt_at = '2026-10-31T00:00:00.000Z' WHERE remote_url = ?").run(pdfUrl);
    t.renewer.requeueExpired(T0);
    assert.equal((t.db.prepare("SELECT next_attempt_at FROM attachments WHERE remote_url = ?").get(pdfUrl) as { next_attempt_at: string }).next_attempt_at, T0.toISOString());
  });

  it("khởi động lại: tin thoại đang chờ lượt thì đóng luôn; tin thoại hỏng 404 từ trước không được xếp lượt", () => {
    const queued = setup({});
    queued.db.prepare("UPDATE attachments SET kind = 'voice', status = 'pending', needs_renew = 1, next_attempt_at = '2026-11-03T17:00:00.000Z'").run();
    queued.renewer.requeueExpired(T0);
    assert.deepEqual([queued.row().status, queued.row().needs_renew, queued.row().next_attempt_at], ["failed", 0, null]);
    assert.match(String(queued.row().last_error), /không cấp lại link cho loại file này/);

    const old = setup({});
    old.db.prepare("UPDATE attachments SET kind = 'voice', status = 'failed', last_error = 'HTTP 404'").run();
    assert.equal(old.renewer.requeueExpired(T0), 0);
    assert.equal(old.row().status, "failed");
  });
});
