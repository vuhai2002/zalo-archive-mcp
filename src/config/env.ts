import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv as parseDotenvText } from "node:util";
import { parseEnv, type AppEnv } from "./env-schema.js";

/** Gốc project, tính từ vị trí file này (src/config) - không phụ thuộc cwd */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Nạp `.env` ở gốc project vào `process.env` nếu có. Biến đã đặt sẵn (từ shell
 * hoặc từ cấu hình MCP của Claude) được GIỮ NGUYÊN, không bị file ghi đè.
 *
 * Cần vì MCP server được Claude khởi chạy với cwd bất kỳ, nên không trông vào
 * việc chạy lệnh từ đúng thư mục.
 */
export function loadDotenvFile(): void {
  const file = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(file)) return;
  const parsed = parseDotenvText(fs.readFileSync(file, "utf-8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let cached: AppEnv | null = null;

/** Env đã validate, đọc một lần cho cả tiến trình */
export function getEnv(): AppEnv {
  if (!cached) {
    loadDotenvFile();
    cached = parseEnv(process.env);
  }
  return cached;
}

/** Khóa mã hóa credential; thiếu thì báo cách tạo thay vì lỗi crypto khó hiểu */
export function requireCredentialsKey(env: AppEnv): string {
  if (!env.CREDENTIALS_ENCRYPTION_KEY) {
    throw new Error(
      'Thiếu CREDENTIALS_ENCRYPTION_KEY trong .env. Tạo bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return env.CREDENTIALS_ENCRYPTION_KEY;
}
