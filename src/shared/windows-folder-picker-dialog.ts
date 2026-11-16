import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Hộp thoại chọn thư mục của Windows, mở trên chính máy chạy daemon (dashboard chỉ nghe 127.0.0.1 nên đó cũng là máy người dùng
 * đang ngồi). Trình duyệt không cho trang web biết đường dẫn thật của thư mục chọn qua hộp thoại của nó, nên daemon mở hộp thoại
 * rồi trả đường dẫn về. Trả null khi người dùng bấm Hủy.
 */
export type FolderPicker = (o: { title: string; initialDir: string | null }) => Promise<string | null>;

const SCRIPT = fileURLToPath(new URL("./windows-folder-picker-dialog.ps1", import.meta.url));
/** Hộp thoại để mở quá lâu thì đóng hẳn, không giữ tiến trình PowerShell mãi */
const MAX_OPEN_MS = 10 * 60_000;

export const pickFolderWithWindowsDialog: FolderPicker = (o) =>
  new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Hộp thoại chọn thư mục chỉ có trên Windows"));
      return;
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
      {
        env: { ...process.env, ZAM_PICK_TITLE: o.title, ZAM_PICK_DIR: o.initialDir ?? "" },
        windowsHide: true,
        encoding: "utf8",
        timeout: MAX_OPEN_MS,
        maxBuffer: 1 << 20,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Không mở được hộp thoại chọn thư mục: ${stderr.trim() || err.message}`));
          return;
        }
        resolve(stdout.trim() || null);
      },
    );
  });
