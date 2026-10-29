import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { acquireSingleInstanceLock } from "./single-instance-lock.js";

describe("acquireSingleInstanceLock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-lock-"));

  it("tiến trình đang sống giữ khóa thì lần lấy thứ hai bị từ chối; nhả rồi lấy lại được", () => {
    const file = path.join(dir, "a.lock");
    const release = acquireSingleInstanceLock(file);
    assert.throws(() => acquireSingleInstanceLock(file), /một listener/);
    release();
    assert.equal(fs.existsSync(file), false);
    acquireSingleInstanceLock(file)();
  });

  it("khóa của tiến trình đã chết thì được thay", () => {
    const file = path.join(dir, "b.lock");
    fs.writeFileSync(file, "999999");
    const release = acquireSingleInstanceLock(file);
    assert.equal(fs.readFileSync(file, "utf-8"), String(process.pid));
    release();
  });
});
