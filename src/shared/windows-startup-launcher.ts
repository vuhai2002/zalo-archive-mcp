import path from "node:path";

/**
 * Tự chạy daemon khi đăng nhập Windows: một file `.vbs` trong thư mục Startup của
 * người dùng chạy daemon ẨN (không bật cửa sổ console). Không cần quyền admin, không
 * đụng Task Scheduler; gỡ là xóa đúng một file.
 *
 * Dùng đường dẫn tuyệt đối tới `node.exe` (không trông vào PATH lúc vừa đăng nhập).
 * Ghi file dạng UTF-16 có BOM: Windows Script Host đọc đúng cả đường dẫn có dấu.
 */
export const LAUNCHER_FILE_NAME = "zalo-archive-daemon.vbs";

export function windowsStartupDir(appData: string): string {
  return path.win32.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

/** Chuỗi trong VBScript: bọc nháy kép, nháy kép bên trong viết thành hai nháy */
const vbsString = (s: string) => `"${s.replaceAll('"', '""')}"`;
/** Một đối số dòng lệnh Windows, bọc nháy kép (đường dẫn có dấu cách) */
const cmdArg = (s: string) => `"${s}"`;

export function buildLauncherVbs(o: { nodeExe: string; projectRoot: string }): string {
  const tsxCli = path.win32.join(o.projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const daemon = path.win32.join(o.projectRoot, "src", "bin", "run-archive-daemon.ts");
  const command = [cmdArg(o.nodeExe), cmdArg(tsxCli), "--disable-warning=ExperimentalWarning", cmdArg(daemon)].join(" ");
  return [
    "' Kho Zalo: chạy daemon ẩn khi đăng nhập Windows.",
    "' Tạo bởi `pnpm autostart install`, gỡ bằng `pnpm autostart uninstall`. Log: data\\logs\\daemon.log",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = ${vbsString(o.projectRoot)}`,
    // 0 = ẩn cửa sổ, False = không chờ: daemon chạy nền tới khi tắt máy hoặc `pnpm stop`
    `sh.Run ${vbsString(command)}, 0, False`,
    "",
  ].join("\r\n");
}

/** Nội dung file .vbs dạng UTF-16 LE có BOM */
export function encodeLauncher(vbs: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs, "utf16le")]);
}
