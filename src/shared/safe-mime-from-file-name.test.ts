import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveMime, safeMimeFromFileName } from "./safe-mime-from-file-name.js";

describe("kiểu file đoán theo đuôi tên (chỉ loại an toàn)", () => {
  it("PDF, nhạc, video, ảnh thường, txt: đoán được, không phân biệt hoa thường", () => {
    assert.equal(safeMimeFromFileName("TAI LIEU MAU.pdf"), "application/pdf");
    assert.equal(safeMimeFromFileName("TAI LIEU MAU.MP3"), "audio/mpeg");
    assert.equal(safeMimeFromFileName("nhac nen mau.m4a"), "audio/mp4");
    assert.equal(safeMimeFromFileName("clip.mov"), "video/quicktime");
    assert.equal(safeMimeFromFileName("ghi chú.txt"), "text/plain; charset=utf-8");
  });

  it("HTML, SVG, loại lạ, không có đuôi: không đoán (vẫn tải về, không chạy được script)", () => {
    for (const name of ["trang.html", "logo.svg", "bao-gia.docx", "nen.zip", "khong-duoi", null]) {
      assert.equal(safeMimeFromFileName(name), null, String(name));
    }
  });

  it("kiểu Zalo gửi kèm được giữ; trống hay octet-stream thì đoán theo đuôi", () => {
    assert.equal(effectiveMime("video/mp4", "a.pdf"), "video/mp4");
    assert.equal(effectiveMime(null, "a.pdf"), "application/pdf");
    assert.equal(effectiveMime("application/octet-stream", "a.mp3"), "audio/mpeg");
    assert.equal(effectiveMime("application/octet-stream", "a.exe"), null);
  });
});
