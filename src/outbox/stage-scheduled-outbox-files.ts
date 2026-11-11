import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";

/**
 * Hẹn giờ gửi file (send_file có send_date / send_time): daemon đọc file LÚC GỬI, có khi là sáng hôm sau. File ngoài kho (ảnh
 * dán vào Claude nằm trong thư mục tạm, file trong Downloads...) có thể bị dọn / xóa trước giờ đó, nên lúc hẹn chép một bản
 * vào thư mục riêng của nick (`outbox-files/<mã>/`), mục hàng đợi trỏ vào bản chép. File đã có trong kho (đính kèm #N) giữ
 * nguyên đường dẫn. Tên hiển thị trên Zalo vẫn là tên gốc (`name`), bản chép chỉ đặt tên theo số thứ tự + đuôi.
 */
export type StagingDirs = { mediaRoot: string; stagingDir: string };

const PENDING = "('draft', 'approved', 'sending')";

const inside = (dir: string, p: string) => {
  const rel = path.relative(path.resolve(dir), path.resolve(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Chép các file ngoài kho vào thư mục riêng; trả danh sách file mới + thư mục bản chép (null nếu không chép gì) */
export function stageFilesForLater(files: OutboxFile[], dirs: StagingDirs, token: string = randomUUID()): { files: OutboxFile[]; stagedDir: string | null } {
  if (files.every((f) => inside(dirs.mediaRoot, f.path))) return { files, stagedDir: null };
  const dir = path.join(dirs.stagingDir, token);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const out = files.map((f, i) => {
      if (inside(dirs.mediaRoot, f.path)) return f;
      const copy = path.join(dir, `${i + 1}${path.extname(f.name).toLowerCase()}`);
      fs.copyFileSync(f.path, copy);
      return { ...f, path: copy };
    });
    return { files: out, stagedDir: dir };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Dọn bản chép không còn mục nào chờ gửi dùng tới (đã gửi, hỏng, hủy). Chạy mỗi lần hẹn gửi file mới - việc hiếm, rẻ, không
 * cần vòng riêng trong daemon. Trả số thư mục đã xóa.
 */
export function sweepStagedFiles(db: DatabaseSync, stagingDir: string): number {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  const inUse = new Set<string>();
  const rows = db.prepare(`SELECT files_json FROM outbox WHERE status IN ${PENDING} AND files_json IS NOT NULL`).all() as Array<{ files_json: string }>;
  for (const r of rows) {
    try {
      for (const f of JSON.parse(r.files_json) as OutboxFile[]) if (inside(stagingDir, f.path)) inUse.add(path.resolve(path.dirname(f.path)));
    } catch {
      // files_json hỏng: bỏ qua dòng đó
    }
  }
  let removed = 0;
  for (const e of entries) {
    const dir = path.resolve(stagingDir, e.name);
    if (!e.isDirectory() || inUse.has(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
