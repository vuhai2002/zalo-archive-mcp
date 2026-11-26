import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { linkWithRealName } from "../../media/real-name-file-links.js";
import { revealFileInWindowsExplorer } from "../../shared/windows-reveal-file-in-explorer.js";
import { getAttachment } from "../../storage/attachment-queue-store.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * POST /attachments/:id/reveal - nút "Mở thư mục chứa file": tạo (hoặc dùng lại) bản tên thật của file trong thư mục
 * "File đã mở" của kho (hard link, không tốn chỗ - real-name-file-links.ts) rồi mở Explorer chọn sẵn file đó. Chỉ file đã
 * tải xong và nằm trong media/ của nick đang dùng; đường dẫn lấy từ DB, không nhận từ yêu cầu.
 */
export function attachmentRevealRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  const reveal = ctx.revealFile ?? revealFileInWindowsExplorer;
  app.post("/attachments/:id/reveal", async (c) => {
    const id = Number(c.req.param("id"));
    const a = Number.isInteger(id) && id > 0 ? getAttachment(ctx.db, id) : null;
    if (!a || a.status !== "done" || typeof a.local_path !== "string") return c.json({ error: "File chưa có trong kho" }, 404);
    const mediaRoot = path.resolve(ctx.paths.mediaDir);
    const original = path.resolve(mediaRoot, a.local_path);
    if (!original.startsWith(mediaRoot + path.sep) || !fs.existsSync(original)) return c.json({ error: "File chưa có trong kho" }, 404);

    const named = linkWithRealName(mediaRoot, original, typeof a.file_name === "string" ? a.file_name : null);
    try {
      await reveal(named.path);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Không mở được thư mục" }, 500);
    }
    return c.json({ ok: true, fileName: path.basename(named.path), realName: named.linked });
  });
  return app;
}
