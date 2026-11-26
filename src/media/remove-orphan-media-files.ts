import fs from "node:fs";
import path from "node:path";
import { deleteMediaFile, fileIdentity, removeRealNameLinks } from "./real-name-file-links.js";

/**
 * Xóa file media không còn tin nào dùng: file chính và các bản đi kèm cạnh nó cùng tên sha - bản JXL gốc của ảnh đã đổi PNG
 * (`<sha>.jxl`), bản gốc HD lấy từ Zalo PC (`<sha>.orig.<đuôi>`). Đường dẫn ra ngoài thư mục media thì bỏ qua. Trả số file đã
 * xóa và tổng dung lượng thật đã giải phóng trên ổ. Bản tên thật (hard link trong "File đã mở", nút Mở thư mục chứa file)
 * của các file này cũng bị xóa, kẻo dung lượng không được trả lại.
 */
export function removeOrphanMediaFilesMeasured(mediaDir: string, relPaths: readonly string[]): { files: number; bytes: number } {
  const root = path.resolve(mediaDir);
  let files = 0;
  let bytes = 0;
  const ids = new Set<string>();
  for (const rel of relPaths) {
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) continue;
    const dir = path.dirname(file);
    const stem = path.basename(file).split(".")[0];
    if (!stem || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name !== stem && !name.startsWith(`${stem}.`)) continue;
      const target = path.join(dir, name);
      const id = fileIdentity(target);
      if (id) ids.add(id);
      try {
        bytes += fs.statSync(target).size;
      } catch {
        // file vừa biến mất: không tính
      }
      deleteMediaFile(target);
      files++;
    }
  }
  removeRealNameLinks(mediaDir, ids);
  return { files, bytes };
}

/** Như trên, chỉ trả số file đã xóa */
export function removeOrphanMediaFiles(mediaDir: string, relPaths: readonly string[]): number {
  return removeOrphanMediaFilesMeasured(mediaDir, relPaths).files;
}

/** Ký tự lớn nhất trong BMP: đặt sau tiền tố để lấy khoảng khóa "mọi chuỗi bắt đầu bằng tiền tố" */
const LAST_CHAR = String.fromCharCode(0xffff);

/**
 * Đường dẫn trong kho (vd `ab/abcd...ef.jpg`) -> khoảng khóa của mọi bản cùng tên sha (`ab/abcd...ef.<gì đó>`), để hỏi "còn
 * đính kèm nào dùng họ file này không" bằng chỉ mục thay vì so đúng đường dẫn (xóa là xóa cả họ).
 */
export function mediaFamilyRange(localPath: string): { exact: string; from: string; to: string } {
  const slash = Math.max(localPath.lastIndexOf("/"), localPath.lastIndexOf("\\"));
  const dir = localPath.slice(0, slash + 1);
  const stem = localPath.slice(slash + 1).split(".")[0] ?? "";
  return { exact: `${dir}${stem}`, from: `${dir}${stem}.`, to: `${dir}${stem}.${LAST_CHAR}` };
}
