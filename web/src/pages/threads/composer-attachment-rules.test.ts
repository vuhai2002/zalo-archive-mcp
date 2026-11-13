import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPhotoName, pasteProblem, pickProblem, sendAsForPasted } from "./composer-attachment-rules";

const f = (name: string, size = 100) => ({ name, size });

describe("luật chọn file trong khung soạn tin", () => {
  it("ảnh chùm chỉ nhận đuôi Zalo gửi được thành chùm", () => {
    assert.equal(isPhotoName("anh-mau.JPG"), true);
    assert.equal(isPhotoName("anh-mau.webp"), true);
    assert.equal(isPhotoName("anh-mau.jxl"), false);
    assert.equal(sendAsForPasted("anh-dan-mau.png"), "photo");
    assert.equal(sendAsForPasted("tai-lieu-mau.pdf"), "file");
  });

  it("báo lỗi: quá 10 file (tính cả file đã có trong khay), không đuôi, rỗng, quá cỡ, file thường vào chùm ảnh", () => {
    assert.equal(pickProblem([f("a.jpg")], "photo"), null);
    assert.equal(pickProblem([f("a.pdf")], "file"), null);
    assert.match(pickProblem(Array.from({ length: 11 }, () => f("a.jpg")), "photo")!, /tối đa 10/);
    assert.match(pickProblem([f("a.jpg")], "photo", 10)!, /tối đa 10/);
    assert.match(pickProblem([f("khong-duoi")], "file")!, /đuôi/);
    assert.match(pickProblem([f("a.txt", 0)], "file")!, /rỗng/);
    assert.match(pickProblem([f("a.mp4", 600 * 1024 * 1024)], "file")!, /quá lớn/);
    assert.match(pickProblem([f("a.pdf")], "photo")!, /không phải ảnh/);
    assert.match(pickProblem([], "file")!, /Chưa chọn/);
  });

  it("dán / kéo thả: mỗi file tự xếp theo đuôi, trần 10 tính cả file đã nằm trong khay", () => {
    assert.equal(pasteProblem([f("anh-dan-mau.png"), f("tai-lieu-mau.pdf")], 0), null);
    assert.match(pasteProblem([f("anh-dan-mau.png")], 10)!, /tối đa 10/);
    assert.match(pasteProblem([f("anh-dan-mau.png", 0)], 0)!, /rỗng/);
  });
});
