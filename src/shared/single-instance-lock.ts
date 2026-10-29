import fs from "node:fs";

/**
 * Khóa một-tiến-trình theo file pid. Zalo chỉ cho MỘT listener mỗi tài khoản:
 * hai daemon cùng account sẽ đá nhau liên tục - đúng kiểu hành vi dễ bị gắn cờ.
 *
 * File khóa của tiến trình đã chết (mất điện, kill -9) được nhận ra qua
 * `process.kill(pid, 0)` và ghi đè.
 */
export function acquireSingleInstanceLock(lockFile: string): () => void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
      return () => {
        try {
          if (fs.readFileSync(lockFile, "utf-8").trim() === String(process.pid)) fs.rmSync(lockFile);
        } catch {
          /* đã bị xóa */
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number(fs.readFileSync(lockFile, "utf-8").trim());
      if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
        throw new Error(`Đã có daemon khác (pid ${pid}) chạy cho account này. Zalo chỉ cho một listener mỗi tài khoản.`);
      }
      // Chỉ xóa nếu file vẫn là khóa CŨ vừa đọc: tiến trình khác có thể vừa thay khóa mới vào
      if (fs.readFileSync(lockFile, "utf-8").trim() === String(pid)) fs.rmSync(lockFile, { force: true });
    }
  }
  throw new Error(`Không lấy được khóa ${lockFile}`);
}

/** pid của daemon đang giữ khóa (còn sống); null nếu không có daemon nào chạy */
export function lockHolderPid(lockFile: string): number | null {
  let pid: number;
  try {
    pid = Number(fs.readFileSync(lockFile, "utf-8").trim());
  } catch {
    return null;
  }
  return Number.isInteger(pid) && pid > 0 && isAlive(pid) ? pid : null;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: tiến trình tồn tại nhưng thuộc người dùng khác
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
