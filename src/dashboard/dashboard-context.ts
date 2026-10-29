import type { DatabaseSync } from "node:sqlite";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { DashboardAuth } from "./dashboard-auth.js";
import type { AccountSummary, SessionStatus } from "./dashboard-api-contract.js";

/** Phần quản lý nick + phiên Zalo mà dashboard cần - interface để test thay bằng bản giả */
export type AccountControl = {
  status: () => SessionStatus;
  accounts: () => AccountSummary[];
  /** Nick đang dùng (DB + thư mục); null khi chưa đăng nhập nick nào */
  active: () => { account: { id: string }; paths: AccountPaths; db: DatabaseSync } | null;
  startQrLogin: () => void;
  startActive: () => Promise<void>;
  stopActive: () => void;
  logoutActive: () => void;
  switchTo: (id: string) => Promise<void>;
};

/** Dùng chung cho cả dashboard: mật khẩu, danh sách nick, cấu hình */
export type DashboardAppContext = {
  env: AppEnv;
  auth: DashboardAuth;
  accounts: AccountControl;
  version: string;
};

/**
 * Ngữ cảnh của route đọc kho / gửi / cài đặt / media: DB + thư mục của NICK ĐANG DÙNG.
 * Đổi nick là dashboard chuyển sang bộ route dựng cho nick kia.
 */
export type DashboardContext = {
  db: DatabaseSync;
  env: AppEnv;
  paths: AccountPaths;
};
