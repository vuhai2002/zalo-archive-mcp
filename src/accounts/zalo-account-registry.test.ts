import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadOrImportAccountRegistry } from "./load-or-import-account-registry.js";
import {
  accountRegistryFile,
  readAccountRegistry,
  setActiveAccountId,
  upsertAccountByUid,
  writeAccountRegistry,
  type AccountRegistry,
} from "./zalo-account-registry.js";

const tmpDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "zam-accounts-"));
const NOW = "2026-10-29T05:00:00.000Z";

describe("danh sách nick", () => {
  it("quét QR nick đã có (cùng uid) thì dùng lại nick cũ, nick lạ thì thêm với id = uid", () => {
    let reg: AccountRegistry = {
      activeAccountId: "nick-phu",
      accounts: [{ id: "nick-phu", uid: "111", displayName: "Phụ", avatarUrl: null, addedAt: NOW, lastActiveAt: null, readOnly: false }],
    };
    const again = upsertAccountByUid(reg, "111", NOW);
    assert.equal(again.account.id, "nick-phu");
    assert.equal(again.isNew, false);

    const fresh = upsertAccountByUid(reg, "222", NOW);
    assert.equal(fresh.account.id, "222");
    assert.equal(fresh.isNew, true);
    assert.equal(fresh.account.readOnly, true, "nick mới mặc định chỉ đọc");
    assert.equal(again.account.readOnly, false, "nick đã có giữ nguyên");
    reg = setActiveAccountId(fresh.registry, "222");
    assert.equal(reg.activeAccountId, "222");
    assert.equal(reg.accounts.length, 2);
    assert.throws(() => upsertAccountByUid(reg, "../x", NOW), /không hợp lệ/);
    assert.throws(() => setActiveAccountId(reg, "khong-co"), /Không có nick/);
  });

  it("file bị sửa tay: bỏ id lạ (trỏ ra ngoài thư mục), id trùng, nick đang dùng không tồn tại", () => {
    const dir = tmpDataDir();
    fs.writeFileSync(
      accountRegistryFile(dir),
      JSON.stringify({
        activeAccountId: "../../etc",
        accounts: [
          { id: "../../etc", uid: "1" },
          { id: "ok-1", uid: "abc", displayName: " Tên " },
          { id: "ok-1", uid: "2" },
          { id: "ok-2", uid: "3", readOnly: "có" },
          { id: "ok-3", uid: "4", readOnly: true },
        ],
      }),
    );
    const reg = readAccountRegistry(dir)!;
    assert.deepEqual(
      reg.accounts.map((a) => [a.id, a.uid, a.displayName, a.readOnly]),
      // Thiếu cờ (nick có từ trước): như cũ, gửi được. Cờ sai kiểu: nghi ngờ thì chỉ đọc
      [
        ["ok-1", null, "Tên", false],
        ["ok-2", "3", null, true],
        ["ok-3", "4", null, true],
      ],
    );
    assert.equal(reg.activeAccountId, null);
  });

  it("máy chạy bản cũ: dựng danh sách từ thư mục có sẵn, nick đang dùng = cookie lưu gần nhất", () => {
    const dir = tmpDataDir();
    for (const id of ["nick-chinh", "nick-phu", "demo"]) {
      fs.mkdirSync(path.join(dir, "accounts", id), { recursive: true });
      fs.writeFileSync(path.join(dir, "accounts", id, "archive.db"), "");
    }
    fs.writeFileSync(path.join(dir, "accounts", "nick-chinh", "credentials.enc"), "x");
    fs.writeFileSync(path.join(dir, "accounts", "nick-phu", "credentials.enc"), "x");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(dir, "accounts", "nick-phu", "credentials.enc"), later, later);

    const identities: Record<string, { uid: string | null; displayName: string | null; avatarUrl: string | null }> = {
      "nick-chinh": { uid: "100", displayName: "Chính", avatarUrl: null },
      "nick-phu": { uid: "200", displayName: "Phụ", avatarUrl: "https://a/x.jpg" },
      demo: { uid: null, displayName: null, avatarUrl: null },
    };
    const reg = loadOrImportAccountRegistry(dir, (file) => identities[path.basename(path.dirname(file))]!);
    assert.deepEqual(
      reg.accounts.map((a) => a.id),
      ["demo", "nick-chinh", "nick-phu"],
    );
    assert.equal(reg.activeAccountId, "nick-phu");
    // Lần sau đọc file đã ghi, không quét lại thư mục
    writeAccountRegistry(dir, { ...reg, activeAccountId: "nick-chinh" });
    assert.equal(loadOrImportAccountRegistry(dir, () => assert.fail("không được quét lại")).activeAccountId, "nick-chinh");
  });

  it("máy mới tinh: danh sách rỗng, chưa có nick đang dùng", () => {
    const reg = loadOrImportAccountRegistry(tmpDataDir());
    assert.deepEqual(reg, { activeAccountId: null, accounts: [] });
  });
});
