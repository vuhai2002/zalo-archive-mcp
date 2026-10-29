import fs from "node:fs";
import { accountPaths } from "../config/account-paths.js";
import type { AccountSummary } from "../dashboard/dashboard-api-contract.js";
import type { AccountRecord } from "./zalo-account-registry.js";

/** Một dòng trong danh sách nick cho dashboard: kèm còn cookie không, có phải nick đang dùng không */
export function toAccountSummary(a: AccountRecord, dataDir: string, activeAccountId: string | null): AccountSummary {
  return {
    id: a.id,
    uid: a.uid,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    lastActiveAt: a.lastActiveAt,
    hasCredentials: fs.existsSync(accountPaths(dataDir, a.id).credentialsFile),
    active: a.id === activeAccountId,
    readOnly: a.readOnly,
  };
}

/** Đăng nhập xong: tên + avatar mới nhất từ Zalo (thiếu thì giữ cái cũ), ghi lần dùng gần nhất */
export function withLoginIdentity(
  a: AccountRecord,
  who: { uid: string; displayName: string | null; avatarUrl: string | null },
  nowIso: string,
): AccountRecord {
  return {
    ...a,
    uid: a.uid ?? who.uid,
    displayName: who.displayName ?? a.displayName,
    avatarUrl: who.avatarUrl ?? a.avatarUrl,
    lastActiveAt: nowIso,
  };
}
