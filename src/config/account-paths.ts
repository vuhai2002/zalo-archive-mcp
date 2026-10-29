import path from "node:path";
import type { AppEnv } from "./env-schema.js";
import { PROJECT_ROOT } from "./env.js";

/**
 * Mọi file của MỘT account nằm chung một thư mục `data/accounts/<id>/`, để chạy
 * thử trên nick phụ rồi chuyển sang nick chính không trộn dữ liệu của hai bên.
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

export function accountPaths(env: AppEnv): AccountPaths {
  const root = path.join(resolveDataDir(env), "accounts", env.ZALO_ACCOUNT_ID);
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
