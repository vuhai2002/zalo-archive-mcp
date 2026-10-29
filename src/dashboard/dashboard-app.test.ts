import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { accountPaths } from "../config/account-paths.js";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { markAttachmentDone } from "../storage/attachment-queue-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { createDashboardAuth } from "./dashboard-auth.js";
import type { SessionStatus } from "./dashboard-api-contract.js";
import { createDashboardApp } from "./create-dashboard-app.js";

const HOST = "127.0.0.1:3210";

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-dash-"));
  const env = parseEnv({ ZALO_ACCOUNT_ID: "test", DATA_DIR: dataDir, DASHBOARD_PASSWORD: "mat-khau-dai" });
  const paths = accountPaths(env);
  const db = openArchiveDatabase(":memory:");
  upsertMessage(
    db,
    sampleMessage({ attachments: [{ kind: "photo", remoteUrl: "https://f1.zdn.vn/a.jpg", fileName: null, declaredSize: null }] }),
    { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" },
  );
  const status: SessionStatus = {
    state: "logged_out", selfUid: null, displayName: null, listenerConnected: false,
    qrImageBase64: null, qrStatus: null, lastError: null, lastHeartbeatAt: null,
  };
  const session = { status: () => status, start: async () => {}, startQrLogin: () => {}, stop: () => {}, logout: () => {} };
  const auth = createDashboardAuth("mat-khau-dai", crypto.randomBytes(32).toString("hex"));
  const app = createDashboardApp({ db, env, paths, auth, session, version: "0.0.0" }, { webDistDir: path.join(dataDir, "no-dist"), allowedHosts: [HOST] });
  const call = (url: string, init: RequestInit & { cookie?: string; host?: string } = {}) =>
    app.request(url, {
      ...init,
      headers: { host: init.host ?? HOST, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers as Record<string, string>) },
    });
  const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { db, paths, call, json };
}

async function login(s: ReturnType<typeof setup>): Promise<string> {
  const res = await s.call("/api/auth/login", s.json({ password: "mat-khau-dai" }));
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

describe("dashboard API", () => {
  it("sai mật khẩu 401; chưa đăng nhập thì mọi route khác 401; đăng nhập rồi thì vào được", async () => {
    const s = setup();
    assert.equal((await s.call("/api/auth/login", s.json({ password: "sai" }))).status, 401);
    assert.equal((await s.call("/api/threads")).status, 401);
    const cookie = await login(s);
    assert.match(cookie, /HttpOnly|zam_session=/);
    const res = await s.call("/api/threads", { cookie });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { total: number }).total, 1);
    assert.equal((await s.call("/api/auth/me", { cookie })).status, 200);
  });

  it("Host lạ bị chặn (chống DNS rebinding); route ghi không phải JSON bị chặn", async () => {
    const s = setup();
    assert.equal((await s.call("/api/auth/me", { host: "evil.example:3210" })).status, 403);
    const cookie = await login(s);
    const form = await s.call("/api/kill-switch", { method: "POST", cookie, body: "killed=true", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(form.status, 415);
  });

  it("gửi ngay từ dashboard: tạo tin lẻ đã duyệt; nội dung trống bị 400", async () => {
    const s = setup();
    const cookie = await login(s);
    const ok = await s.call("/api/outbox", { ...s.json({ threadId: "u-lan", text: "Chào", when: "now" }), cookie });
    assert.equal(ok.status, 200);
    const item = (await ok.json()) as { status: string; mode: string; createdBy: string };
    assert.deepEqual([item.status, item.mode, item.createdBy], ["approved", "single", "dashboard"]);
    assert.equal((await s.call("/api/outbox", { ...s.json({ threadId: "u-lan", text: " ", when: "now" }), cookie })).status, 400);
  });

  it("cài đặt: lưu được, sai thì 400; khóa khẩn cấp bật/tắt", async () => {
    const s = setup();
    const cookie = await login(s);
    const put = (body: unknown) => s.call("/api/settings", { ...s.json(body), method: "PUT", cookie });
    assert.equal((await put({ singleMinGapSeconds: 10 })).status, 200);
    assert.equal((await put({ batchMinGapSeconds: 300, batchMaxGapSeconds: 100 })).status, 400);
    await s.call("/api/kill-switch", { ...s.json({ killed: true, reason: "thử" }), cookie });
    assert.equal(getKillSwitch(s.db).killed, true);
  });

  it("route /api lạ trả 404 JSON (không rơi xuống trang SPA), URL hỏng trả 400, limit lẻ không lỗi", async () => {
    const s2 = setup();
    const cookie = await login(s2);
    const nope = await s2.call("/api/khong-co", { cookie });
    assert.equal(nope.status, 404);
    assert.match(nope.headers.get("content-type") ?? "", /json/);
    assert.equal((await s2.call("/%E0%A4%A")).status, 400);
    assert.equal((await s2.call("/api/outbox?limit=1.5", { cookie })).status, 200);
  });

  it("media: chỉ phục vụ file đã tải trong thư mục media, kèm header chống chạy script", async () => {
    const s = setup();
    const cookie = await login(s);
    assert.equal((await s.call("/api/media/1", { cookie })).status, 404);
    fs.mkdirSync(path.join(s.paths.mediaDir, "ab"), { recursive: true });
    fs.writeFileSync(path.join(s.paths.mediaDir, "ab", "abc.jpg"), "anh");
    markAttachmentDone(s.db, 1, { localPath: "ab/abc.jpg", sha256: "abc", sizeBytes: 3, mime: "image/jpeg" });
    const res = await s.call("/api/media/1", { cookie });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "anh");
    assert.match(res.headers.get("content-security-policy") ?? "", /sandbox/);
    s.db.prepare("UPDATE attachments SET local_path = '../../credentials.enc' WHERE id = 1").run();
    assert.equal((await s.call("/api/media/1", { cookie })).status, 404, "không thoát khỏi thư mục media");
  });
});
