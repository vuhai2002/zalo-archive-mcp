// Dừng daemon đang chạy (kể cả daemon chạy ẩn khi đăng nhập Windows).
// Cách dùng: pnpm stop
// Lần chạy sau daemon tự dọn: ghi bù khoảng không nghe tin, tin đang gửi dở đánh failed (KHÔNG gửi lại).
import path from "node:path";
import { resolveDataDir } from "../config/account-paths.js";
import { getEnv } from "../config/env.js";
import { isAlive, lockHolderPid } from "../shared/single-instance-lock.js";

const lockFile = path.join(resolveDataDir(getEnv()), "daemon.lock");
const pid = lockHolderPid(lockFile);
if (!pid) {
  console.log("Không có daemon nào đang chạy.");
  process.exit(0);
}

process.kill(pid, "SIGTERM");
const deadline = Date.now() + 10_000;
while (isAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
if (isAlive(pid)) {
  console.error(`Daemon (pid ${pid}) chưa dừng sau 10 giây.`);
  process.exit(1);
}
console.log(`Đã dừng daemon (pid ${pid}). Chạy lại: pnpm start, hoặc đăng nhập lại Windows nếu đã cài tự chạy.`);
