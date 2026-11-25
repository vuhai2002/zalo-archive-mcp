// Daemon kho: dashboard web + phiên Zalo của nick đang dùng. Không cần sửa .env:
// lần đầu mở dashboard thì tạo mật khẩu, rồi đăng nhập Zalo bằng QR ngay trên đó.
// Nick đang dùng có cookie đã lưu thì tự đăng nhập và chạy. Cách dùng: pnpm start
import fs from "node:fs";
import path from "node:path";
import { loadOrImportAccountRegistry } from "../accounts/load-or-import-account-registry.js";
import { resolveDataDir } from "../config/account-paths.js";
import { loadOrCreateAppSecrets } from "../config/app-secrets-store.js";
import { appAbout, appVersion, createAppUpdateChecker } from "../config/app-version-and-update-checker.js";
import { getEnv } from "../config/env.js";
import { openAccountDatabaseForDaemon } from "../daemon/prepare-account-database.js";
import { ZaloAccountManager } from "../daemon/zalo-account-manager.js";
import { createDashboardAuth } from "../dashboard/dashboard-auth.js";
import { dashboardPasswordFile } from "../dashboard/dashboard-password-store.js";
import { startDashboardServer } from "../dashboard/start-dashboard-server.js";
import { createLogger } from "../shared/logger.js";
import { acquireSingleInstanceLock } from "../shared/single-instance-lock.js";

const env = getEnv();
const dataDir = resolveDataDir(env);
fs.mkdirSync(dataDir, { recursive: true });
const log = createLogger({ name: "daemon", level: env.LOG_LEVEL, logFile: path.join(dataDir, "logs", "daemon.log") });
const version = appVersion();

// MỘT daemon cho cả thư mục data: hai daemon sẽ chạy hai listener cho cùng một nick
const releaseLock = acquireSingleInstanceLock(path.join(dataDir, "daemon.lock"));

const { secrets, created, legacyMismatch } = loadOrCreateAppSecrets(dataDir, env.CREDENTIALS_ENCRYPTION_KEY);
if (created) log.info("Đã tạo khóa mã hóa của app (data/app-secrets.json) - đừng xóa file này, sẽ mất cookie đã lưu");
if (legacyMismatch) log.warn("CREDENTIALS_ENCRYPTION_KEY trong .env khác khóa đang dùng (data/app-secrets.json) - dòng trong .env không còn tác dụng, xóa đi");

const accounts = new ZaloAccountManager({
  env,
  dataDir,
  keyHex: secrets.credentialsKeyHex,
  log,
  registry: loadOrImportAccountRegistry(dataDir),
  openDb: (file, id) => openAccountDatabaseForDaemon(file, env, log.child({ account: id })),
});
const auth = createDashboardAuth({ passwordFile: dashboardPasswordFile(dataDir), sessionSecretHex: secrets.sessionSecretHex });
const closeDashboard = startDashboardServer({ env, auth, accounts, version, updates: createAppUpdateChecker(env), about: appAbout() }, log.child({ part: "dashboard" }));
if (!auth.isPasswordSet()) log.info("Chưa có mật khẩu dashboard - mở dashboard để tạo mật khẩu lần đầu");

let shuttingDown = false;
const shutdown = (code: number, reason: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ reason }, "Đang dừng daemon");
  accounts.shutdown();
  closeDashboard();
  releaseLock();
  // Cho pino kịp ghi nốt log ra file
  setTimeout(() => process.exit(code), 300);
};
process.on("SIGINT", () => shutdown(0, "SIGINT"));
process.on("SIGTERM", () => shutdown(0, "SIGTERM"));
process.on("unhandledRejection", (err) => log.error({ err }, "Promise bị từ chối mà không ai bắt"));

const active = accounts.active();
if (active) {
  log.info({ account: active.account.id }, "Nick đang dùng");
  await accounts.boot();
} else {
  log.info("Chưa có nick Zalo nào - mở dashboard, vào Tài khoản Zalo, quét QR");
}
