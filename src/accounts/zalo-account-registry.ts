import fs from "node:fs";
import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "../shared/json-file-store.js";

/**
 * Danh sách nick Zalo đã từng đăng nhập + nick đang dùng, ở `data/accounts.json`.
 * Mỗi lúc chỉ MỘT nick chạy; đổi nick không xóa gì - dữ liệu từng nick nằm riêng ở
 * `data/accounts/<id>/`. Nick mới có id = uid Zalo; thư mục cũ (vd `nick-phu`) giữ tên.
 *
 * Phần lớn là hàm THUẦN trên object; chỉ `readAccountRegistry` / `writeAccountRegistry` chạm đĩa.
 */
export type AccountRecord = {
  id: string;
  /** null với kho chưa từng đăng nhập Zalo (vd dữ liệu mẫu) */
  uid: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  addedAt: string;
  lastActiveAt: string | null;
};

export type AccountRegistry = { activeAccountId: string | null; accounts: AccountRecord[] };

/** Tên thư mục an toàn: file bị sửa tay cũng không trỏ ra ngoài `data/accounts/` được */
export const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function accountRegistryFile(dataDir: string): string {
  return path.join(dataDir, "accounts.json");
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseRegistry(raw: unknown): AccountRegistry {
  const r = raw as { activeAccountId?: unknown; accounts?: unknown } | null;
  const seen = new Set<string>();
  const accounts: AccountRecord[] = [];
  for (const a of Array.isArray(r?.accounts) ? (r.accounts as Array<Record<string, unknown>>) : []) {
    const id = str(a?.id);
    if (!id || !ACCOUNT_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    const uid = str(a.uid);
    accounts.push({
      id,
      uid: uid && /^\d+$/.test(uid) ? uid : null,
      displayName: str(a.displayName),
      avatarUrl: str(a.avatarUrl),
      addedAt: str(a.addedAt) ?? new Date(0).toISOString(),
      lastActiveAt: str(a.lastActiveAt),
    });
  }
  const active = str(r?.activeAccountId);
  return { activeAccountId: active && seen.has(active) ? active : null, accounts };
}

/** null khi chưa có file (lần chạy đầu, hoặc máy chạy bản cũ chưa có danh sách) */
export function readAccountRegistry(dataDir: string): AccountRegistry | null {
  const raw = readJsonFile(accountRegistryFile(dataDir));
  return raw === null ? null : parseRegistry(raw);
}

export function writeAccountRegistry(dataDir: string, registry: AccountRegistry): void {
  writeJsonFileAtomic(accountRegistryFile(dataDir), registry);
}

export function findAccount(registry: AccountRegistry, id: string | null): AccountRecord | null {
  return id ? (registry.accounts.find((a) => a.id === id) ?? null) : null;
}

export function activeAccount(registry: AccountRegistry): AccountRecord | null {
  return findAccount(registry, registry.activeAccountId);
}

/**
 * Nick vừa đăng nhập QR: uid đã có trong danh sách thì dùng lại nick đó (dữ liệu cũ
 * nối tiếp), chưa có thì thêm nick mới với id = uid.
 */
export function upsertAccountByUid(
  registry: AccountRegistry,
  uid: string,
  nowIso: string,
): { registry: AccountRegistry; account: AccountRecord; isNew: boolean } {
  if (!/^\d+$/.test(uid)) throw new Error(`uid Zalo không hợp lệ: ${uid}`);
  const existing = registry.accounts.find((a) => a.uid === uid);
  if (existing) return { registry, account: existing, isNew: false };
  // Thư mục trùng tên uid nhưng chưa ghi uid (hiếm): nhận luôn thay vì tạo id lạ
  const sameId = registry.accounts.find((a) => a.id === uid);
  if (sameId) {
    const account = { ...sameId, uid };
    return { registry: replaceAccount(registry, account), account, isNew: false };
  }
  const account: AccountRecord = { id: uid, uid, displayName: null, avatarUrl: null, addedAt: nowIso, lastActiveAt: null };
  return { registry: { ...registry, accounts: [...registry.accounts, account] }, account, isNew: true };
}

export function replaceAccount(registry: AccountRegistry, account: AccountRecord): AccountRegistry {
  return { ...registry, accounts: registry.accounts.map((a) => (a.id === account.id ? account : a)) };
}

export function setActiveAccountId(registry: AccountRegistry, id: string): AccountRegistry {
  if (!findAccount(registry, id)) throw new Error(`Không có nick ${id}`);
  return { ...registry, activeAccountId: id };
}

/** Thư mục nick có sẵn trên đĩa (có archive.db) - dùng để nhận dữ liệu của bản cũ */
export function listAccountFolders(dataDir: string): string[] {
  const root = path.join(dataDir, "accounts");
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  return names.filter((n) => ACCOUNT_ID_PATTERN.test(n) && fs.existsSync(path.join(root, n, "archive.db"))).sort();
}
