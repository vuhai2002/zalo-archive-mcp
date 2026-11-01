import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { API } from "zca-js";
import { readAccountRegistry, type AccountRegistry } from "../accounts/zalo-account-registry.js";
import { accountPaths } from "../config/account-paths.js";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import type { WebQrEvent } from "../zalo/zalo-session-login.js";
import { ZaloAccountManager } from "./zalo-account-manager.js";
import { LoginCooldownError } from "./zalo-login-cooldown.js";
import type { SessionIo } from "./zalo-session-manager.js";

/** Khối lưu trữ giả: listener không hẹn nối lại */
const NO_RETRY = { listenerRetry: () => ({ retryAt: null, closeCode: null, closeReason: null }), reconnectListenerNow: () => false };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));
const apiFor = (uid: string, name: string) =>
  ({ getOwnId: () => uid, fetchAccountInfo: async () => ({ profile: { displayName: name, avatar: "" } }) }) as unknown as API;

/** Hai nick có sẵn: nick-phu (uid 111, đang dùng) và nick-chinh (uid 222); cả hai còn cookie */
function setup(opts: { registry?: AccountRegistry } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-accounts-mgr-"));
  const registry: AccountRegistry = opts.registry ?? {
    activeAccountId: "nick-phu",
    accounts: [
      { id: "nick-phu", uid: "111", displayName: "Phụ", avatarUrl: null, addedAt: "x", lastActiveAt: null, readOnly: false },
      { id: "nick-chinh", uid: "222", displayName: "Chính", avatarUrl: null, addedAt: "x", lastActiveAt: null, readOnly: false },
    ],
  };
  for (const a of registry.accounts) {
    fs.mkdirSync(accountPaths(dataDir, a.id).root, { recursive: true });
    fs.writeFileSync(accountPaths(dataDir, a.id).credentialsFile, "cookie");
  }
  let clock = 1_800_000_000_000;
  const running = new Set<string>();
  const cookieLogins: Array<{ file: string; d: ReturnType<typeof deferred<API>> }> = [];
  const qr = { done: deferred<API>(), onEvent: null as ((e: WebQrEvent) => void) | null, aborted: false };
  const io: SessionIo = {
    loginWithStoredCredentials: (file) => {
      const d = deferred<API>();
      cookieLogins.push({ file, d });
      return d.promise;
    },
    startQrLoginForWeb: (onEvent) => {
      qr.done = deferred<API>();
      qr.onEvent = onEvent;
      qr.aborted = false;
      return { done: qr.done.promise, abort: () => void (qr.aborted = true) };
    },
    persistSessionCredentials: (_api, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "cookie");
    },
    startArchiveDaemon: (d) => {
      const id = path.basename(d.paths.root);
      running.add(id);
      return { stop: () => void running.delete(id), isListenerConnected: () => true, ...NO_RETRY };
    },
  };
  const m = new ZaloAccountManager({
    env: parseEnv({ DATA_DIR: dataDir, ZALO_LOGIN_COOLDOWN_SECONDS: "30" }),
    dataDir,
    keyHex: "00",
    log: createSilentLogger(),
    registry,
    openDb: () => openArchiveDatabase(":memory:"),
    io,
    now: () => clock,
  });
  return { m, dataDir, qr, running, cookieLogins, tick: (s: number) => void (clock += s * 1000) };
}

describe("ZaloAccountManager", () => {
  it("quét QR nick mới: nick đang chạy dừng (GIỮ cookie), nick mới vào danh sách và chạy", async () => {
    const { m, dataDir, qr, running, cookieLogins, tick } = setup();
    const boot = m.boot();
    cookieLogins[0]!.d.resolve(apiFor("111", "Phụ"));
    await boot;
    assert.deepEqual([...running], ["nick-phu"]);
    assert.throws(() => m.startQrLogin(), LoginCooldownError, "vừa đăng nhập lúc khởi động thì chưa cho tạo QR");

    tick(31);
    m.startQrLogin();
    assert.equal(m.status().state, "qr_pending");
    assert.deepEqual([...running], [], "phải dừng nick cũ trước khi tạo QR");
    qr.onEvent!({ type: "qr", imageBase64: "AAAA" });
    assert.equal(m.status().qrImageBase64, "AAAA");
    qr.done.resolve(apiFor("333", "Nick mới"));
    await flush();
    await flush();

    assert.deepEqual([...running], ["333"]);
    const reg = readAccountRegistry(dataDir)!;
    assert.equal(reg.activeAccountId, "333");
    assert.equal(reg.accounts.find((a) => a.id === "333")?.displayName, "Nick mới");
    assert.equal(fs.existsSync(accountPaths(dataDir, "nick-phu").credentialsFile), true, "cookie nick cũ còn nguyên");
    assert.equal(m.status().account?.id, "333");
    // Nick lạ mới quét QR mặc định CHỈ ĐỌC; nick có từ trước giữ nguyên
    assert.deepEqual([m.isReadOnly("333"), m.isReadOnly("nick-phu"), m.isReadOnly("khong-co")], [true, false, true]);
    assert.equal(m.status().account?.readOnly, true);
    m.setReadOnly("333", false);
    assert.equal(readAccountRegistry(dataDir)!.accounts.find((a) => a.id === "333")?.readOnly, false, "lưu xuống accounts.json");
  });

  it("quét QR đúng nick cũ đang không dùng: nối tiếp thư mục cũ, không tạo nick trùng", async () => {
    const { m, dataDir, qr, running } = setup();
    m.startQrLogin();
    qr.done.resolve(apiFor("222", "Chính"));
    await flush();
    await flush();
    assert.deepEqual([...running], ["nick-chinh"]);
    const reg = readAccountRegistry(dataDir)!;
    assert.equal(reg.accounts.length, 2);
    assert.equal(reg.activeAccountId, "nick-chinh");
  });

  it("chuyển nick có cookie: đăng nhập luôn; chuyển tiếp ngay thì bị chặn và vẫn ở nick cũ", async () => {
    const { m, running, cookieLogins, tick } = setup();
    const sw = m.switchTo("nick-chinh");
    assert.equal(path.basename(path.dirname(cookieLogins[0]!.file)), "nick-chinh");
    cookieLogins[0]!.d.resolve(apiFor("222", "Chính"));
    await sw;
    assert.deepEqual([...running], ["nick-chinh"]);

    tick(10);
    await assert.rejects(m.switchTo("nick-phu"), (err: unknown) => err instanceof LoginCooldownError && err.secondsLeft === 20);
    assert.equal(m.status().account?.id, "nick-chinh");
    assert.deepEqual([...running], ["nick-chinh"], "bị chặn thì không dừng nick đang chạy");

    tick(25);
    const back = m.switchTo("nick-phu");
    cookieLogins[1]!.d.resolve(apiFor("111", "Phụ"));
    await back;
    assert.deepEqual([...running], ["nick-phu"]);
  });

  it("QR hết hạn / từ chối thì tạo lại được ngay (chưa đăng nhập xong thì không tính nhịp)", async () => {
    const { m, qr } = setup();
    m.startQrLogin();
    qr.onEvent!({ type: "declined" });
    qr.done.reject(new Error("aborted"));
    await flush();
    assert.equal(m.status().state, "error");
    assert.match(m.status().lastError ?? "", /từ chối/);
    m.stopActive();
    assert.doesNotThrow(() => m.startQrLogin());
    assert.equal(m.status().state, "qr_pending");
  });

  it("Hủy QR rồi điện thoại vẫn xác nhận: bỏ qua, không đăng nhập ngầm, không thêm nick", async () => {
    const { m, dataDir, qr, running } = setup();
    m.startQrLogin();
    m.stopActive();
    assert.equal(qr.aborted, true);
    qr.done.resolve(apiFor("444", "Lạ"));
    await flush();
    assert.deepEqual([...running], []);
    assert.equal(readAccountRegistry(dataDir), null, "không ghi danh sách nick");
    assert.equal(m.status().state, "stopped");
  });

  it("máy mới chưa có nick: trạng thái logged_out, account null; quét QR là có nick đầu tiên", async () => {
    const { m, dataDir, qr, running } = setup({ registry: { activeAccountId: null, accounts: [] } });
    assert.deepEqual([m.status().state, m.status().account], ["logged_out", null]);
    m.startQrLogin();
    qr.done.resolve(apiFor("555", "Đầu tiên"));
    await flush();
    await flush();
    assert.deepEqual([...running], ["555"]);
    assert.equal(readAccountRegistry(dataDir)!.activeAccountId, "555");
  });
});
