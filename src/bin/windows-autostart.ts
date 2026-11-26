// Tự chạy daemon (ẩn, không cửa sổ) mỗi khi đăng nhập Windows.
// Cách dùng: pnpm autostart install | uninstall | status
//   install   : đặt file khởi động vào thư mục Startup của bạn và chạy daemon ẩn ngay (nếu chưa chạy)
//   uninstall : gỡ file khởi động (daemon đang chạy vẫn chạy, dừng bằng `pnpm stop`)
//   status    : đã cài chưa, daemon có đang chạy không
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "../config/account-paths.js";
import { getEnv, PROJECT_ROOT } from "../config/env.js";
import { lockHolderPid } from "../shared/single-instance-lock.js";
import { buildLauncherVbs, encodeLauncher, LAUNCHER_FILE_NAME, windowsStartupDir } from "../shared/windows-startup-launcher.js";
import { removePathSync } from "../shared/remove-path-sync.js";

if (process.platform !== "win32" || !process.env.APPDATA) {
  console.error("Lệnh này chỉ dành cho Windows. Máy khác: dùng systemd / launchd để chạy `pnpm start` lúc khởi động.");
  process.exit(1);
}

const env = getEnv();
const launcher = path.join(windowsStartupDir(process.env.APPDATA), LAUNCHER_FILE_NAME);
const lockFile = path.join(resolveDataDir(env), "daemon.lock");
const dashboardUrl = `http://127.0.0.1:${env.DASHBOARD_PORT}`;
const command = process.argv[2] ?? "status";

function printStatus(): void {
  const pid = lockHolderPid(lockFile);
  console.log(`Tự chạy khi đăng nhập: ${fs.existsSync(launcher) ? "ĐÃ CÀI" : "chưa cài"} (${launcher})`);
  console.log(pid ? `Daemon: đang chạy (pid ${pid}) - dashboard ${dashboardUrl}` : "Daemon: không chạy");
}

if (command === "install") {
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, encodeLauncher(buildLauncherVbs({ nodeExe: process.execPath, projectRoot: PROJECT_ROOT })));
  console.log("Đã cài: daemon sẽ tự chạy ẩn mỗi lần đăng nhập Windows.");
  if (lockHolderPid(lockFile)) {
    console.log("Daemon đang chạy sẵn - không mở thêm (mỗi lúc chỉ một daemon).");
  } else {
    // Chạy ngay bằng chính file khởi động, giống hệt lúc đăng nhập
    spawn("wscript.exe", ["//nologo", launcher], { detached: true, stdio: "ignore" }).unref();
    console.log(`Đã chạy daemon ẩn. Vài giây nữa mở ${dashboardUrl}`);
  }
} else if (command === "uninstall") {
  removePathSync(launcher, { force: true });
  console.log("Đã gỡ tự chạy. Daemon đang chạy (nếu có) vẫn chạy tới khi `pnpm stop` hoặc tắt máy.");
} else if (command === "status") {
  printStatus();
} else {
  console.error(`Lệnh lạ: ${command}. Dùng: pnpm autostart install | uninstall | status`);
  process.exit(1);
}
