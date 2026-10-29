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
import { ZaloSessionManager, type SessionIdentity, type SessionIo } from "./zalo-session-manager.js";

/** Promise mở tay để điều khiển đúng lúc nào "đăng nhập xong" */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const fakeApi = {
  getOwnId: () => "123",
  fetchAccountInfo: async () => ({ profile: { displayName: "Tôi", avatar: "https://zdn.vn/a.jpg" } }),
} as unknown as API;

function setup(withCredentials = true) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-session-"));
  const env = parseEnv({ DATA_DIR: dataDir });
  const paths = accountPaths(dataDir, "test");
  fs.mkdirSync(paths.root, { recursive: true });
  if (withCredentials) fs.writeFileSync(paths.credentialsFile, "x");

  let archivesStarted = 0;
  let archivesStopped = 0;
  const identities: SessionIdentity[] = [];
  const cookieLogins: Array<ReturnType<typeof deferred<API>>> = [];
  const io: SessionIo = {
    loginWithStoredCredentials: () => {
      const d = deferred<API>();
      cookieLogins.push(d);
      return d.promise;
    },
    startQrLoginForWeb: () => assert.fail("phiên một nick không tự tạo QR"),
    persistSessionCredentials: () => fs.writeFileSync(paths.credentialsFile, "cookie"),
    startArchiveDaemon: () => {
      archivesStarted++;
      return { stop: () => void archivesStopped++, isListenerConnected: () => true };
    },
  };
  const m = new ZaloSessionManager({
    db: openArchiveDatabase(":memory:"),
    env,
    paths,
    keyHex: "00",
    log: createSilentLogger(),
    io,
    onIdentity: (who) => identities.push(who),
  });
  return { m, paths, cookieLogins, identities, counts: () => ({ started: archivesStarted, stopped: archivesStopped }) };
}

describe("ZaloSessionManager", () => {
  it("đăng nhập bằng cookie xong thì chạy đúng một khối lưu trữ và báo nick là ai", async () => {
    const { m, cookieLogins, counts, identities } = setup();
    const p = m.start();
    cookieLogins[0]!.resolve(fakeApi);
    await p;
    assert.equal(m.status().state, "running");
    assert.deepEqual(counts(), { started: 1, stopped: 0 });
    assert.deepEqual(identities, [{ uid: "123", displayName: "Tôi", avatarUrl: "https://zdn.vn/a.jpg" }]);
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

  it("nhận phiên vừa quét QR: lưu cookie, chạy listener; phiên đang chạy dừng trước", async () => {
    const { m, paths, cookieLogins, counts } = setup(false);
    await m.attach(fakeApi);
    assert.equal(fs.readFileSync(paths.credentialsFile, "utf-8"), "cookie");
    await m.attach(fakeApi);
    assert.deepEqual(counts(), { started: 2, stopped: 1 });
    assert.equal(cookieLogins.length, 0);
  });
});
