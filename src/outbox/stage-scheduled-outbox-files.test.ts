import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { enqueueOutboxItem } from "../storage/outbox-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { stageFilesForLater, sweepStagedFiles } from "./stage-scheduled-outbox-files.js";

function dirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stage-files-"));
  const mediaRoot = path.join(root, "media");
  const stagingDir = path.join(root, "outbox-files");
  const outside = path.join(root, "tam");
  fs.mkdirSync(mediaRoot);
  fs.mkdirSync(outside);
  return { root, mediaRoot, stagingDir, outside };
}

describe("chép file của tin hẹn giờ", () => {
  it("file ngoài kho được chép vào thư mục riêng (tên hiển thị giữ nguyên); file đã có trong kho giữ đường dẫn", () => {
    const d = dirs();
    const inKho = path.join(d.mediaRoot, "ab12.jpg");
    const temp = path.join(d.outside, "Ảnh chụp 1.PNG");
    fs.writeFileSync(inKho, "kho");
    fs.writeFileSync(temp, "tam");
    const r = stageFilesForLater(
      [
        { path: inKho, name: "anh-kho.jpg", size: 3, kind: "image" },
        { path: temp, name: "Ảnh chụp 1.PNG", size: 3, kind: "image" },
      ],
      d,
      "ma-1",
    );
    assert.equal(r.stagedDir, path.join(d.stagingDir, "ma-1"));
    assert.equal(r.files[0]!.path, inKho);
    assert.deepEqual(r.files[1], { path: path.join(d.stagingDir, "ma-1", "2.png"), name: "Ảnh chụp 1.PNG", size: 3, kind: "image" });
    fs.rmSync(temp);
    assert.equal(fs.readFileSync(r.files[1]!.path, "utf8"), "tam", "file gốc bị xóa sau khi hẹn thì bản chép vẫn còn");
    assert.deepEqual(stageFilesForLater([r.files[0]!], d).stagedDir, null, "toàn file trong kho thì không chép gì");
    fs.rmSync(d.root, { recursive: true, force: true });
  });

  it("dọn bản chép: giữ thư mục của mục còn chờ gửi, xóa thư mục không còn mục nào chờ dùng", () => {
    const d = dirs();
    const db = openArchiveDatabase(":memory:");
    const src = path.join(d.outside, "a.pdf");
    fs.writeFileSync(src, "pdf");
    const file = { path: src, name: "a.pdf", size: 3, kind: "file" as const };
    const pending = stageFilesForLater([file], d, "dang-cho");
    const done = stageFilesForLater([file], d, "da-gui");
    const add = (files: typeof pending.files) =>
      enqueueOutboxItem(db, { threadId: "u-lan", threadType: "user", text: "", mode: "single", notBefore: null, batchId: null, createdBy: "mcp", note: null, status: "approved", files });
    add(pending.files);
    db.prepare("UPDATE outbox SET status = 'sent' WHERE id = ?").run(add(done.files));
    assert.equal(sweepStagedFiles(db, d.stagingDir), 1);
    assert.ok(fs.existsSync(pending.stagedDir!));
    assert.ok(!fs.existsSync(done.stagedDir!));
    assert.equal(sweepStagedFiles(db, path.join(d.root, "chua-co")), 0, "chưa có thư mục thì thôi");
    fs.rmSync(d.root, { recursive: true, force: true });
  });
});
