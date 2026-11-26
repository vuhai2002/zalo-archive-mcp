import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { linkWithRealName, realNameDirOf, safeWindowsFileName } from "./real-name-file-links.js";
import { removeOrphanMediaFilesMeasured } from "./remove-orphan-media-files.js";

function tempMedia() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zam-real-name-"));
  const mediaDir = path.join(root, "media");
  const put = (rel: string, body: string) => {
    const f = path.join(mediaDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
    return f;
  };
  return { mediaDir, put };
}
const sameIno = (a: string, b: string) => fs.statSync(a, { bigint: true }).ino === fs.statSync(b, { bigint: true }).ino;

describe("bản tên thật cho nút Mở thư mục chứa file", () => {
  it("hard link tên thật trong File đã mở, chỉ đọc; bấm lại thì dùng lại; trùng tên file khác thì thêm (2)", () => {
    const { mediaDir, put } = tempMedia();
    const a = put("aa/aaaa.zip", "noi dung a");
    const b = put("bb/bbbb.zip", "noi dung b");

    const first = linkWithRealName(mediaDir, a, "ho-so-thu-nghiem.zip");
    assert.deepEqual([first.linked, first.path], [true, path.join(realNameDirOf(mediaDir), "ho-so-thu-nghiem.zip")]);
    assert.ok(sameIno(first.path, a), "cùng nội dung, không chép");
    assert.throws(() => fs.writeFileSync(first.path, "ghi đè"), "chỉ đọc: không sửa được bản trong kho");
    assert.equal(linkWithRealName(mediaDir, a, "ho-so-thu-nghiem.zip").path, first.path, "bấm lại: dùng lại link cũ");

    const other = linkWithRealName(mediaDir, b, "ho-so-thu-nghiem.zip");
    assert.equal(path.basename(other.path), "ho-so-thu-nghiem (2).zip");
    assert.ok(sameIno(other.path, b));
  });

  it("xóa file khỏi kho thì xóa luôn bản tên thật, link của file khác giữ nguyên", () => {
    const { mediaDir, put } = tempMedia();
    const a = put("aa/aaaa.zip", "noi dung a");
    put("aa/aaaa.orig.zip", "ban goc");
    const b = put("bb/bbbb.pdf", "noi dung b");
    const la = linkWithRealName(mediaDir, a, "bao-cao-mau.zip").path;
    const lb = linkWithRealName(mediaDir, b, "bang-gia-mau.pdf").path;

    const r = removeOrphanMediaFilesMeasured(mediaDir, ["aa/aaaa.zip"]);
    assert.equal(r.files, 2);
    assert.deepEqual([fs.existsSync(a), fs.existsSync(la), fs.existsSync(lb)], [false, false, true]);
  });

  it("tên file lạ thành tên Windows hợp lệ", () => {
    assert.equal(safeWindowsFileName('a<b>:c"d/e\\f|g?h*.txt', "x"), "a_b__c_d_e_f_g_h_.txt");
    assert.equal(safeWindowsFileName("ten-cuoi-co-cham. . ", "x"), "ten-cuoi-co-cham");
    assert.equal(safeWindowsFileName("CON.txt", "abcd.txt"), "abcd.txt");
    assert.equal(safeWindowsFileName(null, "abcd.zip"), "abcd.zip");
    const long = safeWindowsFileName(`${"a".repeat(300)}.pdf`, "x");
    assert.equal([long.length, long.endsWith(".pdf")].join(), "150,true");
  });
});
