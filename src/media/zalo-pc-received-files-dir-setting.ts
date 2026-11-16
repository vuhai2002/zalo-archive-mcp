import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";

/**
 * Thư mục Zalo PC lưu file người dùng tải / mở (Zalo PC > Cài đặt > Tin nhắn > "File được lưu tại thư mục"), người dùng chọn
 * trên dashboard cho từng nick. Kho tự đoán được chỗ mặc định (xem `zaloPcReceivedFilesDirs`) nhưng không biết khi người dùng
 * đổi sang chỗ khác trong Zalo PC - ô chọn này bù chỗ đó. Kho CHỈ ĐỌC thư mục này. Chuỗi rỗng = chưa chọn.
 */
const META_KEY = "zalo_pc_received_files_dir";

export function chosenReceivedFilesDir(db: DatabaseSync): string | null {
  return getMeta(db, META_KEY) || null;
}

/** Kiểm đường dẫn người dùng dán: bỏ khoảng trắng + ngoặc kép (kiểu "Copy as path"), phải tuyệt đối, có thật, là thư mục */
export function checkReceivedFilesDir(input: unknown): { ok: true; dir: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Cần đường dẫn thư mục" };
  const raw = input.trim().replace(/^"(.*)"$/, "$1").trim();
  if (!raw || !path.isAbsolute(raw)) return { ok: false, error: "Cần đường dẫn đầy đủ của thư mục, vd X:\\Thu-muc-mau\\Zalo Received Files" };
  const dir = path.resolve(raw);
  let isDir = false;
  try {
    isDir = fs.statSync(dir).isDirectory();
  } catch {
    return { ok: false, error: "Không thấy thư mục này trên máy" };
  }
  return isDir ? { ok: true, dir } : { ok: false, error: "Đường dẫn này là file, không phải thư mục" };
}

export function saveReceivedFilesDir(db: DatabaseSync, dir: string | null): void {
  setMeta(db, META_KEY, dir ?? "");
}
