import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { cleanUploadName, resolveUploads, saveUpload, UploadRejected } from "./dashboard-upload-store.js";

const staging = () => fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-upload-"));
const body = (bytes: number) => new Blob([Buffer.alloc(bytes, 7)]).stream();

describe("tải file lên từ dashboard", () => {
  it("ghi file xuống thư mục riêng, trả mã + tên gốc + cỡ; tên trên ổ không phải tên gốc", async () => {
    const dir = staging();
    const up = await saveUpload(dir, "Bảng giá mẫu.pdf", body(1000), 1000);
    assert.equal(up.name, "Bảng giá mẫu.pdf");
    assert.equal(up.size, 1000);
    assert.deepEqual(fs.readdirSync(path.join(dir, up.uploadId)).sort(), ["meta.json", "upload.pdf"]);
  });

  it("quá trần cỡ: báo 413 (theo Content-Length hoặc khi đang ghi), không để lại gì", async () => {
    const dir = staging();
    await assert.rejects(saveUpload(dir, "a.jpg", body(10), 5000, 100), (e: UploadRejected) => e.status === 413);
    await assert.rejects(saveUpload(dir, "a.jpg", body(500), null, 100), (e: UploadRejected) => e.status === 413);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  it("file rỗng bị từ chối, không để lại thư mục", async () => {
    const dir = staging();
    await assert.rejects(saveUpload(dir, "rong.txt", body(0), 0), /rỗng/);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  it("tên file: bỏ phần đường dẫn; thiếu đuôi, ký tự điều khiển, tên trống thì từ chối", () => {
    assert.equal(cleanUploadName("C:\\Users\\x\\anh.png"), "anh.png");
    assert.equal(cleanUploadName("../../ghi-chu.txt"), "ghi-chu.txt");
    assert.throws(() => cleanUploadName("khong-duoi"), /đuôi/);
    assert.throws(() => cleanUploadName(".env"), /đuôi/);
    assert.throws(() => cleanUploadName("a\u202e.txt"), /điều khiển/);
    assert.throws(() => cleanUploadName(""), /Thiếu tên/);
  });
});

describe("đổi mã tải lên thành mục gửi", () => {
  it("ảnh gửi vào chùm là image, gửi bằng Đính kèm File là file (kể cả ảnh)", async () => {
    const dir = staging();
    const a = await saveUpload(dir, "anh-thu-mot.jpg", body(20), 20);
    const b = await saveUpload(dir, "anh-thu-hai.jpg", body(20), 20);
    const files = resolveUploads(dir, [
      { id: a.uploadId, as: "photo" },
      { id: b.uploadId, as: "file" },
    ]);
    assert.deepEqual(
      files.map((f) => [f.name, f.kind, f.size]),
      [
        ["anh-thu-mot.jpg", "image", 20],
        ["anh-thu-hai.jpg", "file", 20],
      ],
    );
    assert.ok(files[0]!.path.startsWith(path.join(dir, a.uploadId)));
  });

  it("file không phải ảnh thì không vào chùm ảnh; mã lạ, mã trùng, mã đã bị dọn đều báo lỗi", async () => {
    const dir = staging();
    const pdf = await saveUpload(dir, "tai-lieu-mau.pdf", body(20), 20);
    assert.throws(() => resolveUploads(dir, [{ id: pdf.uploadId, as: "photo" }]), /không phải ảnh/);
    assert.throws(() => resolveUploads(dir, [{ id: "../x", as: "file" }]), /không hợp lệ/);
    assert.throws(() => resolveUploads(dir, [{ id: pdf.uploadId, as: "file" }, { id: pdf.uploadId, as: "file" }]), /hai lần/);
    fs.rmSync(path.join(dir, pdf.uploadId), { recursive: true });
    assert.throws(() => resolveUploads(dir, [{ id: pdf.uploadId, as: "file" }]), /chọn lại/);
  });

  it("tối đa 10 file mỗi lần gửi", () => {
    const uses = Array.from({ length: 11 }, () => ({ id: "00000000-0000-4000-8000-000000000000", as: "file" as const }));
    assert.throws(() => resolveUploads(staging(), uses), /tối đa 10/);
  });
});
