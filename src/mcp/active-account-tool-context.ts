import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { accountRegistryFile, readAccountRegistry } from "../accounts/zalo-account-registry.js";
import { accountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import type { ReadToolContext } from "./archive-read-tool-handlers.js";

/**
 * Ngữ cảnh tool MCP luôn theo NICK ĐANG DÙNG trên dashboard: mỗi lần tool đọc
 * `db` / `mediaRoot` / `accountId` là xem lại `data/accounts.json` (nhớ theo thời điểm
 * sửa file, nên gần như không tốn gì). Người dùng đổi nick thì Claude đọc / gửi theo
 * nick mới mà không phải khởi động lại MCP. DB mỗi nick mở một lần rồi giữ.
 *
 * MCP chỉ ĐỌC danh sách nick, không bao giờ ghi.
 */
export function createActiveAccountToolContext(env: AppEnv, dataDir: string): ReadToolContext & { close: () => void } {
  const dbs = new Map<string, DatabaseSync>();
  let cacheKey = "";
  let cachedId: string | null = null;

  const activeId = (): string => {
    let key = "";
    try {
      const stat = fs.statSync(accountRegistryFile(dataDir));
      key = `${stat.mtimeMs}:${stat.size}`;
    } catch {
      key = "missing";
    }
    if (key !== cacheKey) {
      cachedId = key === "missing" ? null : (readAccountRegistry(dataDir)?.activeAccountId ?? null);
      cacheKey = key;
    }
    if (!cachedId) {
      throw new Error("Chưa có nick Zalo nào. Người dùng cần chạy dashboard (pnpm start) và đăng nhập Zalo bằng QR.");
    }
    return cachedId;
  };

  return {
    env,
    get accountId() {
      return activeId();
    },
    get db() {
      const id = activeId();
      let db = dbs.get(id);
      if (!db) {
        db = openArchiveDatabase(accountPaths(dataDir, id).databaseFile);
        dbs.set(id, db);
      }
      return db;
    },
    get mediaRoot() {
      return accountPaths(dataDir, activeId()).mediaDir;
    },
    close: () => {
      for (const db of dbs.values()) db.close();
      dbs.clear();
    },
  };
}
