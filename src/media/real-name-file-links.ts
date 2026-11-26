import fs from "node:fs";
import path from "node:path";
import { removePathSync } from "../shared/remove-path-sync.js";

/**
 * Bản TÊN THẬT của file trong kho, để nút "Mở thư mục chứa file" trên dashboard mở Explorer ở đúng file. Kho lưu file theo
 * mã sha (`media/ab/abcd...ef.zip`, hàng nghìn file) nên mở thẳng chỗ đó không ai nhận ra. Thay vào đó tạo một HARD LINK
 * tên thật trong thư mục "File đã mở" cạnh `media/` (cùng ổ): không tốn thêm dung lượng, tức thì kể cả file vài trăm MB.
 *
 * - Link chung nội dung với file gốc, nên đặt chỉ đọc: mở bằng app khác rồi lỡ lưu đè cũng không sửa được bản trong kho
 *   (kho không bao giờ ghi đè file media; xóa thì vẫn xóa được).
 * - Xóa file khỏi kho thì xóa luôn các link của nó (`removeRealNameLinks`), kẻo dung lượng không được trả lại.
 * - Ổ không hỗ trợ hard link: trả lại chính file gốc (vẫn mở được thư mục, chỉ là tên mã).
 */
export const REAL_NAME_DIR = "File đã mở";

export function realNameDirOf(mediaDir: string): string {
  return path.join(path.dirname(path.resolve(mediaDir)), REAL_NAME_DIR);
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const MAX_NAME = 150;

/** Tên file an toàn cho Windows: bỏ ký tự cấm / điều khiển, dấu chấm / cách ở cuối, tên dành riêng; quá dài thì cắt giữ đuôi */
export function safeWindowsFileName(name: string | null, fallback: string): string {
  let n = (name ?? "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .trim()
    .replace(/[. ]+$/, "");
  if (!n || RESERVED.test(n)) n = fallback;
  if (n.length > MAX_NAME) {
    const ext = path.extname(n).slice(0, 20);
    n = n.slice(0, MAX_NAME - ext.length) + ext;
  }
  return n;
}

const sameFile = (a: string, b: string) => {
  try {
    const x = fs.statSync(a, { bigint: true });
    const y = fs.statSync(b, { bigint: true });
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
};

/** "Báo cáo.pdf", "Báo cáo (2).pdf", "Báo cáo (3).pdf"... */
function candidateNames(name: string): string[] {
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  return [name, ...Array.from({ length: 98 }, (_, i) => `${stem} (${i + 2})${ext}`)];
}

/**
 * Đường dẫn tên thật cho `originalFile` (file trong media/). Đã có link của đúng file này dưới tên đó thì dùng lại; trùng
 * tên với file khác thì thêm (2), (3)... `linked` = false khi phải trả lại file gốc (ổ không cho hard link).
 */
export function linkWithRealName(mediaDir: string, originalFile: string, fileName: string | null): { path: string; linked: boolean } {
  const dir = realNameDirOf(mediaDir);
  const name = safeWindowsFileName(fileName, path.basename(originalFile));
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const candidate of candidateNames(name)) {
      const target = path.join(dir, candidate);
      if (fs.existsSync(target)) {
        if (sameFile(target, originalFile)) return { path: target, linked: true };
        continue;
      }
      fs.linkSync(originalFile, target);
      try {
        fs.chmodSync(target, 0o444);
      } catch {
        // không đặt được chỉ đọc: link vẫn dùng được
      }
      return { path: target, linked: true };
    }
  } catch {
    // ổ không hỗ trợ hard link (FAT / exFAT), thiếu quyền...: rơi xuống mở file gốc
  }
  return { path: originalFile, linked: false };
}

/** Xóa một file media kể cả khi đang chỉ đọc (cờ chỉ đọc của link tên thật nằm chung với file gốc trong kho) */
export function deleteMediaFile(file: string): void {
  removePathSync(file, { force: true });
}

/** Định danh (ổ + số hiệu file) của các file sắp xóa khỏi media/, để tìm link tên thật của chúng */
export function fileIdentity(file: string): string | null {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

/** Xóa các link tên thật trỏ vào những file có định danh trong `ids`; trả số link đã xóa */
export function removeRealNameLinks(mediaDir: string, ids: ReadonlySet<string>): number {
  const dir = realNameDirOf(mediaDir);
  if (ids.size === 0 || !fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const target = path.join(dir, name);
    const id = fileIdentity(target);
    if (!id || !ids.has(id)) continue;
    try {
      deleteMediaFile(target);
      removed++;
    } catch {
      // đang mở trong app khác (bị khóa): để lại, không làm hỏng lượt xóa khỏi kho
    }
  }
  return removed;
}
