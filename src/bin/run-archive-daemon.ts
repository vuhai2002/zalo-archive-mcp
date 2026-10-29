// Daemon kho: dashboard web + phiên Zalo. Có cookie đã lưu thì tự đăng nhập và chạy;
// chưa có thì chờ quét QR trên dashboard. Cách dùng: pnpm start
import fs from "node:fs";
import path from "node:path";
import { accountPaths } from "../config/account-paths.js";
import { getEnv, requireCredentialsKey } from "../config/env.js";
import { createDashboardAuth } from "../dashboard/dashboard-auth.js";
import { startDashboardServer } from "../dashboard/start-dashboard-server.js";
import { ZaloSessionManager } from "../daemon/zalo-session-manager.js";
import { createLogger } from "../shared/logger.js";
import { acquireSingleInstanceLock } from "../shared/single-instance-lock.js";
import { resetStuckDownloads } from "../storage/attachment-queue-store.js";
import { closeDanglingConnection } from "../storage/connection-event-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { failStuckSending } from "../storage/outbox-store.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";

const env = getEnv();
const key = requireCredentialsKey(env);
const paths = accountPaths(env);
const log = createLogger({ name: "daemon", level: env.LOG_LEVEL, logFile: paths.logFile });
const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8")).version as string;

fs.mkdirSync(paths.root, { recursive: true });
const releaseLock = acquireSingleInstanceLock(path.join(paths.root, "daemon.lock"));
const db = openArchiveDatabase(paths.databaseFile);

// Dọn dấu vết lần chạy trước bị chết ngang
if (closeDanglingConnection(db, getMeta(db, "listener_heartbeat_at"))) log.warn("Lần chạy trước dừng đột ngột - đã ghi bù khoảng thủng");
const resetMedia = resetStuckDownloads(db, env.MEDIA_MAX_ATTEMPTS);
const failedSends = failStuckSending(db);
if (failedSends > 0) log.warn({ failedSends }, "Có tin đang gửi dở từ lần trước - đánh failed, KHÔNG tự gửi lại");
if (resetMedia > 0) log.info({ resetMedia }, "Đưa media tải dở về hàng đợi");

const session = new ZaloSessionManager({ db, env, paths, keyHex: key, log });

let closeDashboard: (() => void) | null = null;
if (env.DASHBOARD_PASSWORD) {
  closeDashboard = startDashboardServer(
    { db, env, paths, session, version, auth: createDashboardAuth(env.DASHBOARD_PASSWORD, key) },
    log.child({ part: "dashboard" }),
  );
} else {
  log.warn('Chưa đặt DASHBOARD_PASSWORD trong .env - dashboard KHÔNG mở. Đăng nhập Zalo bằng "pnpm login".');
}

let shuttingDown = false;
const shutdown = (code: number, reason: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ reason }, "Đang dừng daemon");
  session.stop();
  setMeta(db, "daemon_session_state", "stopped");
  closeDashboard?.();
  db.close();
  releaseLock();
  // Cho pino kịp ghi nốt log ra file
  setTimeout(() => process.exit(code), 300);
};
process.on("SIGINT", () => shutdown(0, "SIGINT"));
process.on("SIGTERM", () => shutdown(0, "SIGTERM"));
process.on("unhandledRejection", (err) => log.error({ err }, "Promise bị từ chối mà không ai bắt"));

if (fs.existsSync(paths.credentialsFile)) {
  await session.start();
} else {
  log.info("Chưa đăng nhập Zalo - mở dashboard, vào Tài khoản Zalo, quét QR (hoặc chạy pnpm login).");
}
