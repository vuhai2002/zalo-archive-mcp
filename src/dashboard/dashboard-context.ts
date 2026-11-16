import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { FolderPicker } from "../shared/windows-folder-picker-dialog.js";
import type { DashboardAuth } from "./dashboard-auth.js";
import type { AccountSummary, MobileSyncStatus, SessionStatus } from "./dashboard-api-contract.js";

/** Phần quản lý nick + phiên Zalo mà dashboard cần - interface để test thay bằng bản giả */
export type AccountControl = {
  status: () => SessionStatus;
  accounts: () => AccountSummary[];
  /** Nick đang dùng (DB + thư mục); null khi chưa đăng nhập nick nào */
  active: () => { account: { id: string }; paths: AccountPaths; db: DatabaseSync } | null;
  startQrLogin: () => void;
  startActive: () => Promise<void>;
  stopActive: () => void;
  /** Nối listener lại ngay (đang chờ tự nối lại); false nếu không có gì để nối */
  reconnectActive: () => boolean;
  logoutActive: () => void;
  switchTo: (id: string) => Promise<void>;
  /** Nick ở chế độ Chỉ đọc; nick lạ coi như chỉ đọc */
  isReadOnly: (id: string) => boolean;
  setReadOnly: (id: string, readOnly: boolean) => void;
  /** Đồng bộ lịch sử từ điện thoại của nick đang chạy; null khi nick chưa chạy */
  mobileSync: () => MobileSyncControl | null;
};

export type MobileSyncControl = {
  status: () => MobileSyncStatus | null;
  start: (range: { fromTs: number; toTs: number }) => Promise<{ ok: boolean; error?: string }>;
  cancel: () => Promise<void>;
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
  /** Đọc lại mỗi lần hỏi: bật / tắt Chỉ đọc trên dashboard là ăn ngay */
  readOnly: () => boolean;
  /** Log của dashboard (việc chạy nền như lấy media từ Zalo PC ghi vào đây) */
  log?: Logger;
  /** Hộp thoại chọn thư mục trên máy chạy daemon; test thay bằng bản giả. Bỏ trống = hộp thoại Windows thật */
  pickFolder?: FolderPicker;
};
