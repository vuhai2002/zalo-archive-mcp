// Quản trị hàng đợi gửi ở terminal (duyệt, hủy, khóa khẩn cấp). Dashboard có đủ các việc này.
// Cách dùng: pnpm outbox <lệnh>   (chạy không tham số để xem danh sách lệnh)
import { activeAccountForCli } from "../accounts/active-account-for-cli.js";
import { getEnv } from "../config/env.js";
import { runOutboxAdminCommand } from "../outbox/outbox-admin-commands.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";

const env = getEnv();
const db = openArchiveDatabase(activeAccountForCli(env).paths.databaseFile);
const code = await runOutboxAdminCommand({ db, env, io: { print: (line) => console.log(line) } }, process.argv.slice(2));
db.close();
process.exit(code);
