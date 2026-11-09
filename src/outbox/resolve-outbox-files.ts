import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";
import { secretFileReason } from "./blocked-secret-files.js";

/**
 * File gửi kèm tin (lệnh MCP `send_file`): đường dẫn tuyệt đối trên máy này, hoặc file đã có trong kho (số đính kèm #N ở
 * read_thread). Kiểm ngay lúc xếp hàng (có thật, là file, có đuôi, không quá cỡ, không phải file bí mật) rồi chụp lại
 * đường dẫn + tên hiển thị + cỡ; daemon đọc file lúc gửi.
 */
export const MAX_FILES = 10;
/** Daemon đọc trọn file vào bộ nhớ để tải lên (zca-js cũng làm vậy): chặn file quá lớn để tiến trình không phình. Zalo còn trần riêng */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4"]);

export const fileKind = (name: string): OutboxFile["kind"] => {
  const ext = path.extname(name).toLowerCase();
  return IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : "file";
};

const inside = (dir: string, p: string) => {
  const rel = path.relative(path.resolve(dir), path.resolve(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Nơi cất file: thư mục dữ liệu của kho (DB chứa toàn bộ tin, credential, nhật ký thô) là nội bộ, trừ thư mục media */
type Dirs = { mediaRoot: string; dataDir: string };

/** Một file trên máy -> mục gửi, hoặc lý do không gửi được */
function fromPath(filePath: string, name: string, dirs: Dirs): OutboxFile | string {
  if (!path.isAbsolute(filePath)) return `"${filePath}" không phải đường dẫn tuyệt đối`;
  if (inside(dirs.dataDir, filePath) && !inside(dirs.mediaRoot, filePath)) return `"${name}" bị chặn: dữ liệu nội bộ của kho (DB, đăng nhập, nhật ký)`;
  const secret = secretFileReason(filePath);
  if (secret) return `"${name}" bị chặn: ${secret}`;
  if (!path.extname(name)) return `"${name}" không có đuôi file - Zalo cần đuôi để biết loại file`;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return `không thấy file "${filePath}"`;
  }
  if (!stat.isFile()) return `"${filePath}" không phải file`;
  if (stat.size === 0) return `"${name}" rỗng (0 byte)`;
  if (stat.size > MAX_FILE_BYTES) return `"${name}" quá lớn (${Math.round(stat.size / 1048576)} MB, tối đa ${MAX_FILE_BYTES / 1048576} MB)`;
  return { path: filePath, name, size: stat.size, kind: fileKind(name) };
}

/** File đã có trong kho theo số đính kèm: tên gốc của file (ảnh không có tên thì đặt theo số đính kèm) */
function fromArchive(db: DatabaseSync, dirs: Dirs, id: number): OutboxFile | string {
  const a = db.prepare("SELECT kind, file_name, local_path, status FROM attachments WHERE id = ?").get(id) as
    | { kind: string; file_name: string | null; local_path: string | null; status: string }
    | undefined;
  if (!a) return `không có đính kèm #${id} trong kho`;
  if (a.status !== "done" || !a.local_path) return `đính kèm #${id} chưa tải về kho (trạng thái ${a.status})`;
  const ext = path.extname(a.local_path);
  const name = a.file_name && path.extname(a.file_name) ? path.basename(a.file_name) : `${a.kind}-${id}${ext}`;
  return fromPath(path.resolve(dirs.mediaRoot, a.local_path), name, dirs);
}

export function resolveOutboxFiles(
  db: DatabaseSync,
  dirs: Dirs,
  req: { paths?: string[]; attachmentIds?: number[] },
): { files: OutboxFile[] } | { error: string } {
  const paths = req.paths ?? [];
  const ids = req.attachmentIds ?? [];
  if (paths.length + ids.length === 0) return { error: "Chưa có file nào để gửi." };
  if (paths.length + ids.length > MAX_FILES) return { error: `Mỗi lần gửi tối đa ${MAX_FILES} file.` };
  const out: OutboxFile[] = [];
  for (const r of [...paths.map((p) => fromPath(p, path.basename(p), dirs)), ...ids.map((id) => fromArchive(db, dirs, id))]) {
    if (typeof r === "string") return { error: `Không gửi: ${r}. Không xếp tin nào.` };
    out.push(r);
  }
  return { files: out };
}
