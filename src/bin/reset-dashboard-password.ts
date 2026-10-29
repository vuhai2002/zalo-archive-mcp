// Quên mật khẩu dashboard: xóa mật khẩu đã lưu, lần mở dashboard sau sẽ hiện màn hình tạo
// mật khẩu mới. Không đụng tới nick Zalo, cookie hay tin nhắn. Mọi phiên đang đăng nhập hết hiệu lực.
// Cách dùng: pnpm reset-password   (daemon đang chạy cũng được, không cần tắt)
import fs from "node:fs";
import { resolveDataDir } from "../config/account-paths.js";
import { getEnv } from "../config/env.js";
import { dashboardPasswordFile } from "../dashboard/dashboard-password-store.js";

const file = dashboardPasswordFile(resolveDataDir(getEnv()));
if (!fs.existsSync(file)) {
  console.log("Chưa có mật khẩu dashboard nào - mở dashboard là thấy màn hình tạo mật khẩu.");
} else {
  fs.rmSync(file);
  console.log("Đã xóa mật khẩu dashboard. Mở (hoặc tải lại) dashboard để tạo mật khẩu mới.");
}
