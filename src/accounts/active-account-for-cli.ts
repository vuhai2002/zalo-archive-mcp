import { accountPaths, resolveDataDir, type AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import { loadOrImportAccountRegistry } from "./load-or-import-account-registry.js";
import { activeAccount } from "./zalo-account-registry.js";

/**
 * Nick đang dùng (chọn trên dashboard) cho các lệnh terminal. Chưa có nick nào thì
 * dừng lệnh với câu hướng dẫn, không đoán.
 */
export function activeAccountForCli(env: AppEnv): { id: string; dataDir: string; paths: AccountPaths } {
  const dataDir = resolveDataDir(env);
  const account = activeAccount(loadOrImportAccountRegistry(dataDir));
  if (!account) {
    console.error('Chưa có nick Zalo nào. Chạy "pnpm start", mở dashboard, vào Tài khoản Zalo và đăng nhập bằng QR.');
    process.exit(1);
  }
  return { id: account.id, dataDir, paths: accountPaths(dataDir, account.id) };
}
