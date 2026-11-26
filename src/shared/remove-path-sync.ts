import fs from "node:fs";
import path from "node:path";

/**
 * Thay cho `fs.rmSync`, cùng cách gọi. Trên Windows, Node 24 `fs.rmSync` gặp đường dẫn có chữ có dấu ở BẤT KỲ đâu (tên
 * file, thư mục cha - vd thư mục người dùng tên tiếng Việt, thư mục "File đã mở" của kho) thì lặng lẽ không xóa, không báo
 * lỗi: file tạm không được dọn, thậm chí cookie đăng nhập không bị xóa khi đăng xuất. `unlinkSync` / `rmdirSync` /
 * `fs.promises.rm` không bị, nên ở đây tự đi cây bằng chúng.
 *
 * - `force`: không có thì thôi (như rmSync);
 * - `recursive`: thư mục thì xóa cả bên trong; thiếu cờ này mà gặp thư mục thì báo lỗi;
 * - file chỉ đọc (Windows không cho unlink): bỏ cờ chỉ đọc rồi xóa lại.
 */
export function removePathSync(target: string, opts: { recursive?: boolean; force?: boolean } = {}): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (err) {
    if (opts.force && (err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (stat.isDirectory()) {
    if (!opts.recursive) throw Object.assign(new Error(`Là thư mục, cần recursive: ${target}`), { code: "ERR_FS_EISDIR" });
    for (const name of fs.readdirSync(target)) removePathSync(path.join(target, name), { recursive: true, force: true });
    fs.rmdirSync(target);
    return;
  }
  try {
    fs.unlinkSync(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && opts.force) return;
    if (code !== "EPERM" && code !== "EACCES") throw err;
    fs.chmodSync(target, 0o666);
    fs.unlinkSync(target);
  }
}
