import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Đọc / ghi file JSON nhỏ trong `data/` (khóa, mật khẩu băm, danh sách nick).
 * Ghi luôn qua file tạm rồi đổi tên: chết giữa chừng không để lại file hỏng nửa vời.
 * Quyền 0600: chỉ chủ máy đọc được (Windows bỏ qua, nhưng Linux/macOS có tác dụng).
 */

/** Thiếu file thì null; có file mà không phải JSON thì ném (KHÔNG coi như chưa có - dễ ghi đè mất dữ liệu) */
export function readJsonFile(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`File ${path.basename(file)} bị hỏng (không phải JSON). Sửa tay hoặc khôi phục từ bản sao lưu.`);
  }
}

function writeTemp(file: string, value: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return tmp;
}

export function writeJsonFileAtomic(file: string, value: unknown): void {
  const tmp = writeTemp(file, value);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Tạo file MỚI, không bao giờ đè file đã có (vd hai tab cùng bấm "Tạo mật khẩu").
 * Hard link từ file tạm: tạo đủ nội dung một lần, và hỏng nếu đích đã tồn tại.
 * Trả false khi file đã có sẵn.
 */
export function createJsonFileExclusive(file: string, value: unknown): boolean {
  const tmp = writeTemp(file, value);
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
