import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { removePathSync } from "./remove-path-sync.js";

// Thư mục cha có chữ có dấu: đúng chỗ `fs.rmSync` của Node 24 trên Windows lặng lẽ không xóa
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "zam-xóa-thử-"));

describe("removePathSync: xóa được cả đường dẫn có chữ có dấu", () => {
  it("file thường và file chỉ đọc", () => {
    const dir = root();
    const a = path.join(dir, "Tệp thử.txt");
    const b = path.join(dir, "chỉ đọc.txt");
    fs.writeFileSync(a, "x");
    fs.writeFileSync(b, "x");
    fs.chmodSync(b, 0o444);
    removePathSync(a);
    removePathSync(b);
    assert.deepEqual([fs.existsSync(a), fs.existsSync(b)], [false, false]);
  });

  it("thư mục lồng nhau cần recursive; thiếu thì báo lỗi, không xóa gì", () => {
    const dir = path.join(root(), "Thư mục tạm");
    fs.mkdirSync(path.join(dir, "con cháu"), { recursive: true });
    fs.writeFileSync(path.join(dir, "con cháu", "tệp.bin"), "x");
    assert.throws(() => removePathSync(dir));
    assert.ok(fs.existsSync(dir));
    removePathSync(dir, { recursive: true });
    assert.equal(fs.existsSync(dir), false);
  });

  it("không có: force thì thôi, không force thì báo ENOENT như rmSync", () => {
    const missing = path.join(root(), "không có.txt");
    removePathSync(missing, { force: true });
    assert.throws(() => removePathSync(missing), { code: "ENOENT" });
  });
});
