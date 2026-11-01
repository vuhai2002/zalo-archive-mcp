import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { accountPaths, type AccountPaths } from "../config/account-paths.js";
import { parseEnv } from "../config/env-schema.js";
import { UnknownAccountError } from "../daemon/zalo-account-manager.js";
import { LoginCooldownError } from "../daemon/zalo-login-cooldown.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createDashboardApp } from "./create-dashboard-app.js";
import type { SessionStatus } from "./dashboard-api-contract.js";
import { createDashboardAuth } from "./dashboard-auth.js";
import type { AccountControl, MobileSyncControl } from "./dashboard-context.js";
import { dashboardPasswordFile } from "./dashboard-password-store.js";

/** Dựng dashboard thật (route, auth, file mật khẩu) với bộ quản lý nick GIẢ - chỉ dùng trong test */
export const TEST_HOST = "127.0.0.1:3210";
export const TEST_PASSWORD = "mat-khau-dai";

export async function createDashboardHarness(opts: { passwordSet?: boolean; accountIds?: string[] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-dash-"));
  const env = parseEnv({ DATA_DIR: dataDir });
  const auth = createDashboardAuth({ passwordFile: dashboardPasswordFile(dataDir), sessionSecretHex: crypto.randomBytes(32).toString("hex") });
  if (opts.passwordSet ?? true) await auth.setupPassword(TEST_PASSWORD);

  const nicks = new Map<string, { paths: AccountPaths; db: DatabaseSync }>();
  for (const id of opts.accountIds ?? ["test"]) nicks.set(id, { paths: accountPaths(dataDir, id), db: openArchiveDatabase(":memory:") });
  const state = {
    activeId: nicks.size > 0 ? [...nicks.keys()][0]! : null,
    cooldown: false,
    mobileSync: null as MobileSyncControl | null,
    readOnly: new Set<string>(),
  };
  const status = (): SessionStatus => ({
    state: "stopped",
    account: state.activeId
      ? { id: state.activeId, uid: null, displayName: null, avatarUrl: null, lastActiveAt: null, hasCredentials: true, active: true, readOnly: state.readOnly.has(state.activeId) }
      : null,
    selfUid: null,
    displayName: null,
    listenerConnected: false,
    listenerRetryAt: null,
    listenerCloseCode: null,
    listenerCloseReason: null,
    qrImageBase64: null,
    qrStatus: null,
    lastError: null,
    lastHeartbeatAt: null,
  });
  const accounts: AccountControl = {
    status,
    accounts: () => [...nicks.keys()].map((id) => ({ ...status().account!, id, active: id === state.activeId, readOnly: state.readOnly.has(id) })),
    isReadOnly: (id) => state.readOnly.has(id),
    setReadOnly: (id, readOnly) => {
      if (!nicks.has(id)) throw new UnknownAccountError(`Không có nick ${id}`);
      if (readOnly) state.readOnly.add(id);
      else state.readOnly.delete(id);
    },
    active: () => (state.activeId ? { account: { id: state.activeId }, ...nicks.get(state.activeId)! } : null),
    startQrLogin: () => {},
    startActive: async () => {
      if (state.cooldown) throw new LoginCooldownError(12);
    },
    stopActive: () => {},
    reconnectActive: () => false,
    logoutActive: () => {},
    mobileSync: () => state.mobileSync,
    switchTo: async (id) => {
      if (!nicks.has(id)) throw new UnknownAccountError(`Không có nick ${id}`);
      state.activeId = id;
    },
  };

  const app = createDashboardApp({ env, auth, accounts, version: "0.0.0" }, { webDistDir: path.join(dataDir, "no-dist"), allowedHosts: [TEST_HOST] });
  const call = (url: string, init: RequestInit & { cookie?: string; host?: string } = {}) =>
    app.request(url, {
      ...init,
      headers: { host: init.host ?? TEST_HOST, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers as Record<string, string>) },
    });
  const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const login = async (): Promise<string> => {
    const res = await call("/api/auth/login", json({ password: TEST_PASSWORD }));
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const nick = (id: string) => nicks.get(id)!;
  return { dataDir, state, call, json, login, nick };
}
