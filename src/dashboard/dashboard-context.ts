import type { DatabaseSync } from "node:sqlite";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { DashboardAuth } from "./dashboard-auth.js";
import type { SessionStatus } from "./dashboard-api-contract.js";

/** Phần quản lý phiên Zalo mà dashboard cần - interface để test thay bằng bản giả */
export type SessionControl = {
  status: () => SessionStatus;
  start: () => Promise<void>;
  startQrLogin: () => void;
  stop: () => void;
  logout: () => void;
};

export type DashboardContext = {
  db: DatabaseSync;
  env: AppEnv;
  paths: AccountPaths;
  auth: DashboardAuth;
  session: SessionControl;
  version: string;
};
