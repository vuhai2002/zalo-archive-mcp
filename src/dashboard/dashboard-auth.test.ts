import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appSecretsFile, loadOrCreateAppSecrets } from "../config/app-secrets-store.js";
import { createDashboardAuth, SESSION_TTL_MS } from "./dashboard-auth.js";
import { dashboardPasswordFile } from "./dashboard-password-store.js";

const tmpDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "zam-auth-"));
const LEGACY_KEY = "ab".repeat(32);

describe("khóa tự sinh của app", () => {
  it("lần đầu tự tạo, lần sau đọc lại đúng khóa cũ", () => {
    const dir = tmpDataDir();
    const first = loadOrCreateAppSecrets(dir);
    assert.equal(first.created, true);
    assert.match(first.secrets.credentialsKeyHex, /^[0-9a-f]{64}$/);
    const second = loadOrCreateAppSecrets(dir);
    assert.equal(second.created, false);
    assert.deepEqual(second.secrets, first.secrets);
  });

  it("máy chạy bản cũ: lấy khóa trong .env để cookie đã lưu còn giải mã được; file có rồi thì file thắng", () => {
    const dir = tmpDataDir();
    assert.equal(loadOrCreateAppSecrets(dir, LEGACY_KEY).secrets.credentialsKeyHex, LEGACY_KEY);
    const other = loadOrCreateAppSecrets(dir, "cd".repeat(32));
    assert.equal(other.secrets.credentialsKeyHex, LEGACY_KEY);
    assert.equal(other.legacyMismatch, true);
  });

  it("file khóa hỏng thì báo lỗi, KHÔNG tự sinh khóa mới (sẽ mất cookie)", () => {
    const dir = tmpDataDir();
    fs.writeFileSync(appSecretsFile(dir), JSON.stringify({ credentialsKeyHex: "xyz" }));
    assert.throws(() => loadOrCreateAppSecrets(dir), /KHÔNG xóa file/);
  });
});

describe("mật khẩu dashboard", () => {
  const setup = () => {
    const dir = tmpDataDir();
    const file = dashboardPasswordFile(dir);
    return { file, auth: createDashboardAuth({ passwordFile: file, sessionSecretHex: "11".repeat(32) }) };
  };

  it("chưa có mật khẩu: không phiên nào hợp lệ; tạo xong thì đăng nhập được, tạo lần hai bị từ chối", async () => {
    const { file, auth } = setup();
    assert.equal(auth.isPasswordSet(), false);
    assert.equal(auth.verifyToken("123.abc"), false);
    assert.deepEqual(await auth.setupPassword("ngan"), { ok: false, reason: "invalid", message: "Mật khẩu cần ít nhất 8 ký tự" });

    assert.deepEqual(await auth.setupPassword("Mật khẩu dài"), { ok: true });
    assert.equal(auth.isPasswordSet(), true);
    assert.equal(fs.readFileSync(file, "utf-8").includes("Mật khẩu"), false, "không lưu chữ thật");
    assert.equal(await auth.checkPassword("Mật khẩu dài"), true);
    assert.equal(await auth.checkPassword("mật khẩu dài"), false);
    assert.equal((await auth.setupPassword("mat-khau-khac")).ok, false);
  });

  it("chữ có dấu gõ ở dạng Unicode khác (dấu rời) vẫn khớp", async () => {
    const { auth } = setup();
    await auth.setupPassword("Tiếng Việt có dấu");
    assert.equal(await auth.checkPassword("Tiếng Việt có dấu".normalize("NFD")), true);
  });

  it("token hết hạn sau 7 ngày; đặt lại mật khẩu (xóa file) là mọi phiên cũ hết hiệu lực", async () => {
    const { file, auth } = setup();
    await auth.setupPassword("mat-khau-dai");
    const t0 = 1_800_000_000_000;
    const token = auth.createToken(t0);
    assert.equal(auth.verifyToken(token, t0 + 1000), true);
    assert.equal(auth.verifyToken(token, t0 + SESSION_TTL_MS + 1), false);
    assert.equal(auth.verifyToken(`${token}x`, t0), false);

    fs.rmSync(file);
    assert.equal(auth.isPasswordSet(), false);
    assert.equal(auth.verifyToken(token, t0 + 1000), false);
    await auth.setupPassword("mat-khau-moi-dai");
    assert.equal(auth.verifyToken(token, t0 + 1000), false, "phiên của mật khẩu cũ không dùng được với mật khẩu mới");
  });
});
