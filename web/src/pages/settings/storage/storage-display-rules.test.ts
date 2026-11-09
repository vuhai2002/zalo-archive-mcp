import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveTotalBytes, downloadUrlOf, driveBarParts, driveLabel, formatDuration, previewKind } from "./storage-display-rules";

const GB = 1024 ** 3;
const disk = {
  computedAt: "2026-11-09T14:00:00.000Z",
  drive: { totalBytes: 500 * GB, freeBytes: 200 * GB },
  mediaBytes: 60 * GB,
  mediaFiles: 40_000,
  databaseBytes: 2 * GB,
  journalBytes: 0.5 * GB,
  tempBytes: 0,
  backups: [{ name: "archive-cu.db", bytes: 1 * GB, modifiedAt: "2026-11-02T00:00:00.000Z" }],
};

describe("hiển thị dung lượng kho", () => {
  it("tổng kho = media + DB + nhật ký + bản sao + tạm; thanh ổ đĩa chia kho / ứng dụng khác / trống", () => {
    assert.equal(archiveTotalBytes(disk), 63.5 * GB);
    const p = driveBarParts(disk);
    assert.equal(Math.round(p.archive * 10) / 10, 12.7);
    assert.equal(Math.round(p.free), 40);
    assert.equal(Math.round(p.archive + p.other + p.free), 100);
    assert.deepEqual(driveBarParts({ ...disk, drive: { totalBytes: 0, freeBytes: 0 } }), { archive: 0, other: 0, free: 100 });
  });

  it("nhãn ổ, link tải về, thời lượng video", () => {
    assert.equal(driveLabel("D:\\du-an\\kho\\data\\accounts\\1"), "Ổ D:");
    assert.equal(driveLabel("/home/a/data"), "/home/a/data");
    assert.equal(downloadUrlOf("/api/media/5?v=abc"), "/api/media/5?v=abc&download=1");
    assert.equal(downloadUrlOf("/api/media/5"), "/api/media/5?download=1");
    assert.equal(formatDuration(249_000), "04:09");
    assert.equal(formatDuration(3_723_000), "1:02:03");
    assert.equal(formatDuration(null), null);
  });

  it("xem nhanh: ảnh / video / tin thoại theo loại; file gửi dạng file thì theo đuôi, đuôi trình duyệt không mở được thì là file", () => {
    assert.equal(previewKind({ kind: "photo", fileName: null }), "image");
    assert.equal(previewKind({ kind: "voice", fileName: null }), "audio");
    assert.equal(previewKind({ kind: "file", fileName: "zz-mau-07.MP4" }), "video");
    assert.equal(previewKind({ kind: "file", fileName: "Nhạc nền buổi họp_03.mp3" }), "audio");
    assert.equal(previewKind({ kind: "file", fileName: "anh.jpeg" }), "image");
    assert.equal(previewKind({ kind: "file", fileName: "zz-bao-cao-09.pdf" }), "file");
    assert.equal(previewKind({ kind: "file", fileName: "IMG_1.HEIC" }), "file");
    assert.equal(previewKind({ kind: "file", fileName: null }), "file");
  });
});
