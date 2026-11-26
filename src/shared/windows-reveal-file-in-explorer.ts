import { spawn } from "node:child_process";

/**
 * Mở Explorer ở thư mục chứa file và chọn sẵn file đó, trên chính máy chạy daemon (dashboard chỉ nghe 127.0.0.1 nên đó cũng
 * là máy người dùng đang ngồi). Trình duyệt không tự làm được việc này. Test thay bằng bản giả qua context.
 */
export type RevealFileInFolder = (file: string) => Promise<void>;

export const revealFileInWindowsExplorer: RevealFileInFolder = (file) =>
  new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Mở thư mục chứa file chỉ có trên Windows"));
      return;
    }
    // `explorer /select,"<đường dẫn>"`: tự đặt ngoặc kép (windowsVerbatimArguments), để Node không bọc thêm lớp nữa.
    // Explorer thoát với mã 1 cả khi thành công nên không chờ kết quả, chỉ chờ tiến trình khởi động được.
    const child = spawn("explorer.exe", [`/select,"${file}"`], { windowsVerbatimArguments: true, detached: true, stdio: "ignore" });
    child.once("error", (err) => reject(new Error(`Không mở được Explorer: ${err.message}`)));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
