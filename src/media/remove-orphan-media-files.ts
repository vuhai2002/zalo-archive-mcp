import fs from "node:fs";
import path from "node:path";

/**
 * Xóa file media không còn tin nào dùng (tin vừa bị xóa hẳn): file chính và các bản đi kèm cạnh nó cùng
 * tên sha - bản JXL gốc của ảnh đã đổi PNG (`<sha>.jxl`), bản gốc HD lấy từ Zalo PC (`<sha>.orig.<đuôi>`).
 * Đường dẫn ra ngoài thư mục media thì bỏ qua. Trả số file đã xóa.
 */
export function removeOrphanMediaFiles(mediaDir: string, relPaths: readonly string[]): number {
  const root = path.resolve(mediaDir);
  let removed = 0;
  for (const rel of relPaths) {
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) continue;
    const dir = path.dirname(file);
    const stem = path.basename(file).split(".")[0];
    if (!stem || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name !== stem && !name.startsWith(`${stem}.`)) continue;
      fs.rmSync(path.join(dir, name), { force: true });
      removed++;
    }
  }
  return removed;
}
