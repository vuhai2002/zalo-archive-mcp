import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { effectiveMime } from "../../shared/safe-mime-from-file-name.js";
import { getAttachment } from "../../storage/attachment-queue-store.js";
import type { DashboardContext } from "../dashboard-context.js";

/** "bytes=a-b" / "bytes=a-" / "bytes=-n" -> [start, end] trong file; sai hoặc nhiều đoạn thì null */
export function parseByteRange(header: string | undefined, size: number): [number, number] | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
}

/**
 * GET /media/:id - file đính kèm đã tải về kho. Hỗ trợ Range (trình phát video
 * cần để tua). File do người lạ gửi: CSP sandbox + nosniff để không chạy được
 * script nếu là HTML/SVG; đường dẫn kiểm không thoát khỏi thư mục media.
 */
export function mediaFileRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.get("/media/:id", (c) => {
    const id = Number(c.req.param("id"));
    const a = Number.isInteger(id) && id > 0 ? getAttachment(ctx.db, id) : null;
    if (!a || a.status !== "done" || typeof a.local_path !== "string") return c.json({ error: "File chưa có" }, 404);
    const mediaRoot = path.resolve(ctx.paths.mediaDir);
    const file = path.resolve(mediaRoot, a.local_path);
    if (!file.startsWith(mediaRoot + path.sep) || !fs.existsSync(file)) return c.json({ error: "File chưa có" }, 404);

    const size = fs.statSync(file).size;
    const fileName = typeof a.file_name === "string" ? a.file_name : path.basename(file);
    const headers: Record<string, string> = {
      // Không có kiểu file (phần lớn file lấy từ Zalo PC / điện thoại): đoán theo đuôi trong danh sách an toàn để PDF mở
      // trong tab, nhạc / video phát được; loại khác vẫn octet-stream (tải về)
      "content-type": effectiveMime(typeof a.mime === "string" ? a.mime : null, fileName) ?? "application/octet-stream",
      // ?download=1: nút Lưu về máy - trình duyệt tải file về với tên gốc thay vì mở
      "content-disposition": `${c.req.query("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=86400",
      "accept-ranges": "bytes",
    };
    const rangeHeader = c.req.header("range");
    const range = parseByteRange(rangeHeader, size);
    if (rangeHeader && !range) {
      return c.body(null, 416, { ...headers, "content-range": `bytes */${size}` });
    }
    const [start, end] = range ?? [0, size - 1];
    const stream = Readable.toWeb(fs.createReadStream(file, size > 0 ? { start, end } : {})) as ReadableStream;
    return c.body(stream, range ? 206 : 200, {
      ...headers,
      "content-length": String(size > 0 ? end - start + 1 : 0),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    });
  });
  return app;
}
