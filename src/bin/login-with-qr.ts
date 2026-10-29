// Đăng nhập tài khoản Zalo (ZALO_ACCOUNT_ID trong .env) bằng QR, lưu cookie mã hóa.
// Cách dùng: pnpm login   (tắt daemon trước nếu đang chạy cho cùng account)
import { spawn } from "node:child_process";
import fs from "node:fs";
import { accountPaths } from "../config/account-paths.js";
import { getEnv, requireCredentialsKey } from "../config/env.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { loginWithQr, persistSessionCredentials, type QrProgress } from "../zalo/zalo-session-login.js";

const env = getEnv();
const key = requireCredentialsKey(env);
const paths = accountPaths(env);
fs.mkdirSync(paths.root, { recursive: true });

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
  qr_ready: `Mã QR: ${paths.qrImageFile} - quét bằng app Zalo trên điện thoại.`,
  scanned: "Đã quét - bấm xác nhận trên điện thoại.",
  expired: "QR hết hạn, đang tạo mã mới...",
  declined: "Đăng nhập bị từ chối trên điện thoại.",
  got_info: "Đã nhận thông tin đăng nhập.",
};

console.log(`\nĐăng nhập account "${env.ZALO_ACCOUNT_ID}". Chờ tạo mã QR...\n`);

try {
  const api = await loginWithQr(paths.qrImageFile, (p) => {
    console.log(progressText[p]);
    if (p === "qr_ready") openImage(paths.qrImageFile);
  });
  persistSessionCredentials(api, paths.credentialsFile, key);

  const selfUid = String(api.getOwnId());
  const info = (await api.fetchAccountInfo().catch(() => null)) as { profile?: { displayName?: string } } | null;
  const displayName = info?.profile?.displayName ?? "(không rõ tên)";

  const db = openArchiveDatabase(paths.databaseFile);
  setMeta(db, "self_uid", selfUid);
  setMeta(db, "self_display_name", displayName);
  db.close();

  fs.rmSync(paths.qrImageFile, { force: true });
  console.log(`\nĐăng nhập thành công: ${displayName} (uid ${selfUid}).`);
  console.log(`Cookie đã lưu (mã hóa) tại ${paths.credentialsFile}. Chạy "pnpm start" để bắt đầu lưu tin.`);
  process.exit(0);
} catch (err) {
  console.error("\nĐăng nhập thất bại:", err instanceof Error ? err.message : err);
  process.exit(1);
}
