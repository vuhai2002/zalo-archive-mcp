import path from "node:path";
import { ACCOUNT_ID_PATTERN } from "../accounts/zalo-account-registry.js";
import type { AppEnv } from "./env-schema.js";
import { PROJECT_ROOT } from "./env.js";

/**
 * Mọi file của MỘT nick nằm chung một thư mục `data/accounts/<id>/`: đổi nick
 * (nick phụ, nick chính...) không trộn dữ liệu, quay lại nick cũ thì nối tiếp.
 */
export type AccountPaths = {
  root: string;
  credentialsFile: string;
  databaseFile: string;
  mediaDir: string;
  journalDir: string;
  logFile: string;
  qrImageFile: string;
};

export function resolveDataDir(env: AppEnv): string {
  return path.isAbsolute(env.DATA_DIR) ? env.DATA_DIR : path.resolve(PROJECT_ROOT, env.DATA_DIR);
}

export function accountPaths(dataDir: string, accountId: string): AccountPaths {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error(`Tên nick không hợp lệ: ${accountId}`);
  const root = path.join(dataDir, "accounts", accountId);
  return {
    root,
    credentialsFile: path.join(root, "credentials.enc"),
    databaseFile: path.join(root, "archive.db"),
    mediaDir: path.join(root, "media"),
    journalDir: path.join(root, "raw-events"),
    logFile: path.join(root, "logs", "daemon.log"),
    qrImageFile: path.join(root, "qr-login.png"),
  };
}
