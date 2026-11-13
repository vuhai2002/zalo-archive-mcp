import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { getOutboxItem } from "../storage/outbox-store.js";
import type { OutboxItem, OutboxUploadResult } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

async function setup() {
  const h = await createDashboardHarness();
  const { db, paths } = h.nick("test");
  upsertMessage(db, sampleMessage(), { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" });
  const cookie = await h.login();
  const upload = (name: string, bytes: number, type = "application/octet-stream") =>
    h.call(`/api/outbox/uploads?name=${encodeURIComponent(name)}`, { method: "POST", body: Buffer.alloc(bytes, 1), headers: { "content-type": type }, cookie });
  return { ...h, db, paths, cookie, upload };
}

describe("gửi ảnh / file từ khung soạn tin của dashboard", () => {
  it("tải lên rồi gửi: ảnh vào chùm, file kể cả ảnh thành thẻ file; chữ trống vẫn gửi được", async () => {
    const h = await setup();
    const photo = (await (await h.upload("anh-thu-mot.jpg", 50)).json()) as OutboxUploadResult;
    const asFile = (await (await h.upload("anh-thu-hai.png", 60)).json()) as OutboxUploadResult;
    assert.equal(photo.name, "anh-thu-mot.jpg");
    const res = await h.call("/api/outbox", {
      ...h.json({ threadId: "u-lan", text: "", when: "now", uploads: [{ id: photo.uploadId, as: "photo" }, { id: asFile.uploadId, as: "file" }] }),
      cookie: h.cookie,
    });
    assert.equal(res.status, 200);
    const dto = (await res.json()) as OutboxItem;
    assert.deepEqual(dto.files, [
      { name: "anh-thu-mot.jpg", size: 50, kind: "image" },
      { name: "anh-thu-hai.png", size: 60, kind: "file" },
    ]);
    const stored = getOutboxItem(h.db, dto.id)!;
    assert.ok(stored.files.every((f) => fs.existsSync(f.path) && f.path.startsWith(h.paths.outboxFilesDir)));
  });

  it("chỉ route tải file nhận dữ liệu thô; kiểu dữ liệu gửi được từ trang khác (form, text) bị chặn", async () => {
    const h = await setup();
    assert.equal((await h.upload("a.txt", 5, "text/plain")).status, 415);
    assert.equal((await h.upload("a.txt", 5, "multipart/form-data; boundary=x")).status, 415);
    const other = await h.call("/api/outbox", { method: "POST", body: "{}", headers: { "content-type": "application/octet-stream" }, cookie: h.cookie });
    assert.equal(other.status, 415);
  });

  it("không đăng nhập, nick Chỉ đọc, file không có đuôi: không lưu gì", async () => {
    const h = await setup();
    const anon = await h.call("/api/outbox/uploads?name=a.jpg", { method: "POST", body: Buffer.alloc(5), headers: { "content-type": "application/octet-stream" } });
    assert.equal(anon.status, 401);
    assert.equal((await h.upload("khong-duoi", 5)).status, 400);
    h.state.readOnly.add("test");
    assert.equal((await h.upload("a.jpg", 5)).status, 409);
    assert.ok(!fs.existsSync(h.paths.outboxFilesDir) || fs.readdirSync(h.paths.outboxFilesDir).length === 0);
  });

  it("mã tải lên lạ / file không phải ảnh mà đòi vào chùm ảnh: từ chối, không tạo tin", async () => {
    const h = await setup();
    const pdf = (await (await h.upload("tai-lieu-mau.pdf", 30)).json()) as OutboxUploadResult;
    const send = (uploads: unknown) => h.call("/api/outbox", { ...h.json({ threadId: "u-lan", text: "", when: "now", uploads }), cookie: h.cookie });
    assert.equal((await send([{ id: pdf.uploadId, as: "photo" }])).status, 400);
    assert.equal((await send([{ id: "00000000-0000-4000-8000-000000000000", as: "file" }])).status, 400);
    assert.equal((await send("x")).status, 400);
    assert.equal((h.db.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number }).n, 0);
  });

  it("tin chữ có định dạng: lưu định dạng (dời theo chữ đã cắt khoảng trắng); mã lạ thì báo lỗi", async () => {
    const h = await setup();
    const res = await h.call("/api/outbox", {
      ...h.json({ threadId: "u-lan", text: " Hẹn họp lúc 9h nhé", when: "now", styles: [{ start: 1, len: 7, st: "b,c_db342e" }] }),
      cookie: h.cookie,
    });
    assert.equal(res.status, 200);
    const id = ((await res.json()) as OutboxItem).id;
    assert.deepEqual(getOutboxItem(h.db, id)!.styles, [{ start: 0, len: 7, st: "b,c_db342e" }]);
    const bad = await h.call("/api/outbox", { ...h.json({ threadId: "u-lan", text: "Chào", when: "now", styles: [{ start: 0, len: 4, st: "c_000000" }] }), cookie: h.cookie });
    assert.equal(bad.status, 400);
  });
});
