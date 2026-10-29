import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { API } from "zca-js";
import { accountPaths } from "../config/account-paths.js";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import type { WebQrEvent } from "../zalo/zalo-session-login.js";
import { ZaloSessionManager, type SessionIo } from "./zalo-session-manager.js";

/** Promise mở tay để điều khiển đúng lúc nào "đăng nhập xong" */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const fakeApi = { getOwnId: () => "me", fetchAccountInfo: async () => ({ profile: { displayName: "Tôi" } }) } as unknown as API;
const flush = () => new Promise((r) => setImmediate(r));

function setup(withCredentials = true) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-session-"));
  const env = parseEnv({ ZALO_ACCOUNT_ID: "test", DATA_DIR: dataDir });
  const paths = accountPaths(env);
  fs.mkdirSync(paths.root, { recursive: true });
  if (withCredentials) fs.writeFileSync(paths.credentialsFile, "x");

  let archivesStarted = 0;
  let archivesStopped = 0;
  const cookieLogins: Array<ReturnType<typeof deferred<API>>> = [];
  const qr = { done: deferred<API>(), onEvent: null as ((e: WebQrEvent) => void) | null, aborted: false };
  const io: SessionIo = {
    loginWithStoredCredentials: () => {
      const d = deferred<API>();
      cookieLogins.push(d);
      return d.promise;
    },
    startQrLoginForWeb: (onEvent) => {
      qr.onEvent = onEvent;
      return { done: qr.done.promise, abort: () => void (qr.aborted = true) };
    },
    persistSessionCredentials: () => fs.writeFileSync(paths.credentialsFile, "cookie"),
    startArchiveDaemon: () => {
      archivesStarted++;
      return { stop: () => void archivesStopped++, isListenerConnected: () => true };
    },
  };
  const m = new ZaloSessionManager({ db: openArchiveDatabase(":memory:"), env, paths, keyHex: "00", log: createSilentLogger(), io });
  return { m, paths, cookieLogins, qr, counts: () => ({ started: archivesStarted, stopped: archivesStopped }) };
}

describe("ZaloSessionManager", () => {
  it("đăng nhập bằng cookie xong thì chạy đúng một khối lưu trữ", async () => {
    const { m, cookieLogins, counts } = setup();
    const p = m.start();
    cookieLogins[0]!.resolve(fakeApi);
    await p;
    assert.equal(m.status().state, "running");
    assert.deepEqual(counts(), { started: 1, stopped: 0 });
  });

  it("Đăng xuất trong lúc đang đăng nhập: KHÔNG chạy listener, KHÔNG ghi lại cookie", async () => {
    const { m, paths, cookieLogins, counts } = setup();
    const p = m.start();
    m.logout();
    cookieLogins[0]!.resolve(fakeApi);
    await p;
    assert.equal(m.status().state, "logged_out");
    assert.equal(fs.existsSync(paths.credentialsFile), false);
    assert.equal(counts().started, 0);
  });

  it("Dừng rồi Chạy liên tiếp khi lần đăng nhập đầu chưa xong: chỉ MỘT listener", async () => {
    const { m, cookieLogins, counts } = setup();
    const first = m.start();
    m.stop();
    const second = m.start();
    cookieLogins[0]!.resolve(fakeApi);
    cookieLogins[1]!.resolve(fakeApi);
    await Promise.all([first, second]);
    assert.equal(m.status().state, "running");
    assert.equal(counts().started, 1);
  });

  it("Hủy QR rồi điện thoại vẫn xác nhận: bỏ qua, không đăng nhập ngầm", async () => {
    const { m, paths, qr, counts } = setup(false);
    m.startQrLogin();
    qr.onEvent!({ type: "qr", imageBase64: "AAAA" });
    assert.equal(m.status().qrImageBase64, "AAAA");
    m.stop();
    assert.equal(qr.aborted, true);
    qr.done.resolve(fakeApi);
    await flush();
    assert.equal(m.status().state, "logged_out");
    assert.equal(fs.existsSync(paths.credentialsFile), false);
    assert.equal(counts().started, 0);
  });

  it("từ chối trên điện thoại: báo lỗi rõ, không treo ở qr_pending", async () => {
    const { m, qr } = setup(false);
    m.startQrLogin();
    qr.onEvent!({ type: "declined" });
    qr.done.reject(new Error("aborted"));
    await flush();
    assert.equal(m.status().state, "error");
    assert.match(m.status().lastError ?? "", /từ chối/);
  });
});
