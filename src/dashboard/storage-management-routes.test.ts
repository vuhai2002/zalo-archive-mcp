import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { storageSummaryIdle } from "../archive/archive-storage-summary.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import type { OverviewResponse } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";
import type { StorageFilesResponse, StorageOverviewResponse, StorageThreadsResponse } from "./storage-management-contract.js";

const AT = "2026-11-09T14:00:00.000Z";
const MB = 1024 * 1024;

/**
 * Nick thật trên đĩa tạm: nhóm g-1 có video lớn (8 MB) + ảnh nhỏ, Lan (1-1) có file pdf 6 MB dùng chung đúng file với một tin của
 * nhóm; một bản sao DB cũ cạnh archive.db.
 */
async function setup() {
  const h = await createDashboardHarness();
  const { db, paths } = h.nick("test");
  const add = (msgId: string, threadId: string, kind: "photo" | "video" | "file", local: string, size: number, fileName: string | null = null) => {
    upsertMessage(
      db,
      sampleMessage({
        msgId,
        threadId,
        threadType: threadId.startsWith("g-") ? "group" : "user",
        senderId: "u-lan",
        text: `tin ${msgId}`,
        sentAt: `2026-11-0${msgId.slice(-1)}T03:00:00.000Z`,
        attachments: [{ kind, remoteUrl: `https://f.zdn.vn/${msgId}`, fileName, declaredSize: null }],
      }),
      { source: "live", receivedAt: AT },
    );
    db.prepare("UPDATE attachments SET status = 'done', local_path = ?, size_bytes = ?, sha256 = ? WHERE msg_id = ?").run(local, size, local.slice(3, 7), msgId);
    fs.mkdirSync(path.join(paths.mediaDir, path.dirname(local)), { recursive: true });
    fs.writeFileSync(path.join(paths.mediaDir, local), Buffer.alloc(size));
  };
  add("101", "g-1", "video", "vv/vvvv.mp4", 8 * MB);
  add("102", "g-1", "photo", "pp/pppp.jpg", 20_000);
  add("103", "g-1", "file", "ff/ffff.pdf", 6 * MB, "bao-gia.pdf");
  add("204", "u-lan", "file", "ff/ffff.pdf", 6 * MB, "bao-gia.pdf");
  fs.writeFileSync(path.join(paths.root, "archive-truoc-dong-bo-mau.db"), Buffer.alloc(1000));
  const attOf = (msgId: string) => (db.prepare("SELECT id FROM attachments WHERE msg_id = ?").get(msgId) as { id: number }).id;
  return { ...h, db, paths, attOf, cookie: await h.login() };
}

describe("Quản lý dữ liệu (dashboard)", () => {
  it("tổng quan: theo loại + file lớn hơn 5 MB ngay; dung lượng ổ đo ở nền rồi có số, kèm bản sao DB cũ", async () => {
    const s = await setup();
    // Nhật ký tin thô mỗi ngày một file: trang ghi rõ số ngày + từ ngày nào tới ngày nào
    fs.mkdirSync(s.paths.journalDir, { recursive: true });
    for (const day of ["2026-03-01", "2026-03-02", "2026-03-05"]) fs.writeFileSync(path.join(s.paths.journalDir, `${day}.jsonl`), "{}\n");
    const first = (await (await s.call("/api/storage", { cookie: s.cookie })).json()) as StorageOverviewResponse;
    assert.equal(first.computing, true);
    assert.deepEqual(first.byKind.map((k) => [k.kind, k.files]), [["photo", 1], ["video", 1], ["file", 2], ["voice", 0]]);
    assert.deepEqual([first.bigFiles.files, first.bigFiles.preview.map((f) => f.kind)], [3, ["video", "file", "file"]]);
    await storageSummaryIdle(s.paths);
    const done = (await (await s.call("/api/storage", { cookie: s.cookie })).json()) as StorageOverviewResponse;
    assert.equal(done.disk?.mediaBytes, 8 * MB + 20_000 + 6 * MB);
    assert.equal(done.disk?.mediaFiles, 3);
    assert.deepEqual(done.disk?.backups.map((b) => [b.name, b.bytes]), [["archive-truoc-dong-bo-mau.db", 1000]]);
    assert.ok((done.disk?.drive.totalBytes ?? 0) > 0);
    assert.deepEqual(done.disk?.journalDays, { count: 3, first: "2026-03-01", last: "2026-03-05" });
  });

  it("hội thoại xếp theo dung lượng; lưới file theo tab, file lớn, số tin dùng chung + link Lưu về máy tải đúng tên gốc", async () => {
    const s = await setup();
    const threads = (await (await s.call("/api/storage/threads?sort=size", { cookie: s.cookie })).json()) as StorageThreadsResponse;
    assert.deepEqual(threads.items.map((t) => [t.threadId, t.files]), [["g-1", 3], ["u-lan", 1]]);
    const files = (await (await s.call("/api/storage/files?thread=g-1&tab=file", { cookie: s.cookie })).json()) as StorageFilesResponse;
    assert.deepEqual(files.items.map((f) => [f.fileName, f.sharedWith]), [["bao-gia.pdf", 1]]);
    const big = (await (await s.call("/api/storage/files?big=1&tab=all", { cookie: s.cookie })).json()) as StorageFilesResponse;
    assert.equal(big.total, 3);
    const dl = await s.call(`${files.items[0]!.url.split("?")[0]}?download=1`, { cookie: s.cookie });
    assert.match(dl.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''bao-gia\.pdf/);
  });

  it("xóa file giữ tin: xem trước báo dùng chung; xóa ở một nơi file còn trên ổ, xóa cả hai nơi thì giải phóng; tin vẫn còn", async () => {
    const s = await setup();
    const post = (p: string, body: unknown) => s.call(p, { ...s.json(body), cookie: s.cookie });
    assert.deepEqual(await (await post("/api/storage/remove-preview", { threadIds: ["g-1"] })).json(), { files: 3, bytes: 8 * MB + 20_000, shared: 1 });
    assert.deepEqual(await (await post("/api/storage/remove", { threadIds: ["g-1"] })).json(), { removed: 3, filesDeleted: 2, bytes: 8 * MB + 20_000 });
    assert.equal(fs.existsSync(path.join(s.paths.mediaDir, "ff/ffff.pdf")), true, "Lan còn dùng file pdf");
    assert.deepEqual(await (await post("/api/storage/remove", { attachmentIds: [s.attOf("204")] })).json(), { removed: 1, filesDeleted: 1, bytes: 6 * MB });
    assert.equal((s.db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n, 4, "tin vẫn giữ");
    assert.equal((await s.call(`/api/media/${s.attOf("101")}`, { cookie: s.cookie })).status, 404);
    await storageSummaryIdle(s.paths);
  });

  it("chặn yêu cầu sai: không chọn gì, số lạ, tên bản sao lạ; xóa bản sao DB cũ đúng tên thì mất khỏi danh sách", async () => {
    const s = await setup();
    const post = (p: string, body: unknown) => s.call(p, { ...s.json(body), cookie: s.cookie });
    assert.equal((await post("/api/storage/remove", {})).status, 400);
    assert.equal((await post("/api/storage/remove", { attachmentIds: ["1"] })).status, 400);
    assert.equal((await post("/api/storage/remove", { threadIds: ["../x"] })).status, 400);
    assert.equal((await post("/api/storage/backups/delete", { names: ["archive.db"] })).status, 400);
    assert.equal((await post("/api/storage/backups/delete", { names: ["../credentials.enc"] })).status, 400);
    assert.equal((await post("/api/storage/backups/delete", { names: ["archive-khong-co.db"] })).status, 404);
    const r = await post("/api/storage/backups/delete", { names: ["archive-truoc-dong-bo-mau.db"] });
    assert.equal(r.status, 200);
    assert.equal(fs.existsSync(path.join(s.paths.root, "archive-truoc-dong-bo-mau.db")), false);
    await storageSummaryIdle(s.paths);
  });

  it("Tổng quan ra cùng số với Quản lý dữ liệu: file dùng chung tính dung lượng một lần, đếm riêng file chưa tải được", async () => {
    const s = await setup();
    s.db.prepare("UPDATE attachments SET status = 'failed', local_path = NULL WHERE msg_id = '102'").run();
    await (await s.call("/api/storage", { cookie: s.cookie })).json();
    await storageSummaryIdle(s.paths);
    const storage = (await (await s.call("/api/storage", { cookie: s.cookie })).json()) as StorageOverviewResponse;
    const overview = (await (await s.call("/api/overview", { cookie: s.cookie })).json()) as OverviewResponse;
    // pdf 6 MB dùng chung giữa nhóm và Lan: chỉ tính một lần (trước cộng thẳng ra 8 + 6 + 6 MB)
    assert.equal(overview.mediaBytes, 8 * MB + 6 * MB);
    assert.equal(overview.storage.downloadedFiles, storage.byKind.reduce((n, k) => n + k.files, 0));
    assert.equal(overview.storage.downloadedFiles, 3);
    assert.equal(overview.storage.failedFiles, 1);
    assert.deepEqual(overview.storage.disk, storage.disk);
  });
});
