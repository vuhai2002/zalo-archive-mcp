import fs from "node:fs";
import os from "node:os";
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
  /** Bản chép file của tin hẹn giờ gửi qua MCP (send_file có send_date / send_time), xem stage-scheduled-outbox-files.ts */
  outboxFilesDir: string;
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
    outboxFilesDir: path.join(root, "outbox-files"),
  };
}

/**
 * Thư mục Zalo PC lưu media đã tải của một nick: `<ZALO_PC_DATA_DIR hoặc %LOCALAPPDATA%\ZaloPC>\<UID>\ZaloDownloads`.
 * Kho CHỈ ĐỌC thư mục này (CLAUDE.md). null khi không biết thư mục gốc (không phải Windows, chưa đặt biến).
 */
export function zaloPcDownloadsDir(env: AppEnv, uid: string): string | null {
  const root = zaloPcRoot(env);
  if (!root || !/^\d+$/.test(uid)) return null;
  return path.join(root, uid, "ZaloDownloads");
}

const zaloPcRoot = (env: AppEnv) => env.ZALO_PC_DATA_DIR ?? (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "ZaloPC") : null);
const RECEIVED_FILES = "Zalo Received Files";

/**
 * Các thư mục `Zalo Received Files` có trên máy - Zalo PC lưu file người dùng tải / mở ở đây, giữ tên thật. Dò theo thứ tự:
 * thư mục người dùng chọn trên dashboard (`chosen`, đúng chỗ đặt trong Zalo PC > Cài đặt > Tin nhắn), cạnh thư mục dữ liệu
 * THẬT của Zalo PC (vd `%LOCALAPPDATA%\ZaloPC` là liên kết trỏ sang `X:\Du-lieu\ZaloPC` thì là
 * `X:\Du-lieu\Zalo Received Files`) và `Documents\Zalo Received Files` (chỗ mặc định cũ). Kho CHỈ ĐỌC các thư mục này.
 */
export function zaloPcReceivedFilesDirs(env: AppEnv, chosen: string | null = null): string[] {
  const root = zaloPcRoot(env);
  const candidates = [path.join(os.homedir(), "Documents", RECEIVED_FILES)];
  if (root) {
    try {
      candidates.unshift(path.join(path.dirname(fs.realpathSync(root)), RECEIVED_FILES));
    } catch {
      // chưa có Zalo PC trên máy
    }
  }
  if (chosen) candidates.unshift(chosen);
  const found = new Map<string, string>();
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) found.set(fs.realpathSync(dir).toLowerCase(), dir);
    } catch {
      // không có thư mục này
    }
  }
  return [...found.values()];
}
