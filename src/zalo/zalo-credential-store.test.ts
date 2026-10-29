import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadCredentials, saveCredentials } from "./zalo-credential-store.js";

describe("zalo credential store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-cred-"));
  const file = path.join(dir, "credentials.enc");
  const key = crypto.randomBytes(32).toString("hex");
  const creds = { cookie: [{ key: "zpw_sek", value: "bí mật" }], imei: "imei-1", userAgent: "UA" };

  it("ghi rồi đọc lại đúng, file trên đĩa không chứa chữ rõ", () => {
    saveCredentials(file, key, creds);
    assert.deepEqual(loadCredentials(file, key), creds);
    assert.equal(fs.readFileSync(file).includes(Buffer.from("zpw_sek")), false);
  });

  it("sai khóa thì báo lỗi có hướng dẫn, không trả rác", () => {
    const other = crypto.randomBytes(32).toString("hex");
    assert.throws(() => loadCredentials(file, other), /pnpm login/);
  });

  it("chưa đăng nhập thì trả null", () => {
    assert.equal(loadCredentials(path.join(dir, "khong-co.enc"), key), null);
  });
});
