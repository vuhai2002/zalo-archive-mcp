// Đăng nhập Zalo bằng QR ở terminal - đường dự phòng, bình thường quét QR ngay trên dashboard.
// Quét nick nào thì lưu vào nick đó (đã có thì nối tiếp dữ liệu cũ) và đặt làm nick đang dùng.
// Cách dùng: pnpm login   (tắt daemon trước: mỗi lúc chỉ một nơi đăng nhập)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadOrImportAccountRegistry } from "../accounts/load-or-import-account-registry.js";
import { replaceAccount, setActiveAccountId, upsertAccountByUid, writeAccountRegistry } from "../accounts/zalo-account-registry.js";
import { accountPaths, resolveDataDir } from "../config/account-paths.js";
import { loadOrCreateAppSecrets } from "../config/app-secrets-store.js";
import { getEnv } from "../config/env.js";
import { acquireSingleInstanceLock } from "../shared/single-instance-lock.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { loginWithQr, persistSessionCredentials, type QrProgress } from "../zalo/zalo-session-login.js";
import { removePathSync } from "../shared/remove-path-sync.js";

const env = getEnv();
const dataDir = resolveDataDir(env);
fs.mkdirSync(dataDir, { recursive: true });
// Cùng khóa với daemon: daemon đang chạy thì từ chối, không để hai nơi cùng đăng nhập
const releaseLock = acquireSingleInstanceLock(path.join(dataDir, "daemon.lock"));
const { secrets } = loadOrCreateAppSecrets(dataDir, env.CREDENTIALS_ENCRYPTION_KEY);
const qrImageFile = path.join(dataDir, "qr-login.png");

function openImage(file: string): void {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", file]]
      : process.platform === "darwin"
        ? ["open", [file]]
        : ["xdg-open", [file]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* không mở được thì người dùng tự mở theo đường dẫn đã in */
  }
}

const progressText: Record<QrProgress, string> = {
  qr_ready: `Mã QR: ${qrImageFile} - quét bằng app Zalo trên điện thoại.`,
  scanned: "Đã quét - bấm xác nhận trên điện thoại.",
  expired: "QR hết hạn, đang tạo mã mới...",
  declined: "Đăng nhập bị từ chối trên điện thoại.",
  got_info: "Đã nhận thông tin đăng nhập.",
};

console.log("\nĐăng nhập Zalo. Chờ tạo mã QR...\n");

try {
  const api = await loginWithQr(qrImageFile, (p) => {
    console.log(progressText[p]);
    if (p === "qr_ready") openImage(qrImageFile);
  });
  const uid = String(api.getOwnId());
  const info = (await api.fetchAccountInfo().catch(() => null)) as { profile?: { displayName?: string; avatar?: string } } | null;
  const displayName = info?.profile?.displayName?.trim() || null;

  const now = new Date().toISOString();
  const { registry, account, isNew } = upsertAccountByUid(loadOrImportAccountRegistry(dataDir), uid, now);
  const paths = accountPaths(dataDir, account.id);
  persistSessionCredentials(api, paths.credentialsFile, secrets.credentialsKeyHex);
  const db = openArchiveDatabase(paths.databaseFile);
  setMeta(db, "self_uid", uid);
  if (displayName) setMeta(db, "self_display_name", displayName);
  db.close();
  writeAccountRegistry(
    dataDir,
    replaceAccount(setActiveAccountId(registry, account.id), {
      ...account,
      displayName: displayName ?? account.displayName,
      avatarUrl: info?.profile?.avatar?.trim() || account.avatarUrl,
      lastActiveAt: now,
    }),
  );

  removePathSync(qrImageFile, { force: true });
  console.log(`\nĐăng nhập thành công: ${displayName ?? "(không rõ tên)"} (uid ${uid})${isNew ? " - nick mới" : " - nối tiếp dữ liệu cũ"}.`);
  console.log('Chạy "pnpm start" để bắt đầu lưu tin.');
  releaseLock();
  process.exit(0);
} catch (err) {
  console.error("\nĐăng nhập thất bại:", err instanceof Error ? err.message : err);
  releaseLock();
  process.exit(1);
}
