import fs from "node:fs";
import { accountPaths } from "../config/account-paths.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getMeta } from "../storage/thread-directory-store.js";
import {
  listAccountFolders,
  readAccountRegistry,
  writeAccountRegistry,
  type AccountRecord,
  type AccountRegistry,
} from "./zalo-account-registry.js";

export type FolderIdentity = { uid: string | null; displayName: string | null; avatarUrl: string | null };

/** Đọc nick là ai từ chính DB của thư mục đó (uid, tên, avatar đã lưu lúc đăng nhập) */
export function readFolderIdentity(databaseFile: string): FolderIdentity {
  const db = openArchiveDatabase(databaseFile);
  try {
    const uid = getMeta(db, "self_uid");
    const avatar = uid
      ? (db.prepare("SELECT avatar_url FROM contacts WHERE user_id = ?").get(uid) as { avatar_url: string | null } | undefined)
      : undefined;
    return { uid: uid && /^\d+$/.test(uid) ? uid : null, displayName: getMeta(db, "self_display_name"), avatarUrl: avatar?.avatar_url ?? null };
  } finally {
    db.close();
  }
}

/**
 * Danh sách nick; chưa có file thì dựng từ các thư mục `data/accounts/*` sẵn có
 * (máy chạy bản cũ, nick chọn bằng `.env`). Nick đang dùng = thư mục có cookie
 * được lưu gần nhất, hoặc thư mục duy nhất. Chưa có gì thì danh sách rỗng: người
 * dùng đăng nhập QR trên dashboard là có nick đầu tiên.
 */
export function loadOrImportAccountRegistry(
  dataDir: string,
  identityOf: (databaseFile: string) => FolderIdentity = readFolderIdentity,
): AccountRegistry {
  const existing = readAccountRegistry(dataDir);
  if (existing) return existing;

  const now = new Date().toISOString();
  let newestCookie = -1;
  let activeAccountId: string | null = null;
  const accounts: AccountRecord[] = [];
  for (const id of listAccountFolders(dataDir)) {
    const paths = accountPaths(dataDir, id);
    const who = identityOf(paths.databaseFile);
    // Hai thư mục cùng một uid (hiếm): giữ cái đầu, không để danh sách có nick trùng
    if (who.uid && accounts.some((a) => a.uid === who.uid)) continue;
    accounts.push({ id, ...who, addedAt: now, lastActiveAt: null });
    const cookieAt = fs.existsSync(paths.credentialsFile) ? fs.statSync(paths.credentialsFile).mtimeMs : -1;
    if (cookieAt > newestCookie) {
      newestCookie = cookieAt;
      activeAccountId = id;
    }
  }
  if (activeAccountId === null && accounts.length === 1) activeAccountId = accounts[0]!.id;
  const registry: AccountRegistry = { activeAccountId, accounts };
  writeAccountRegistry(dataDir, registry);
  return registry;
}
