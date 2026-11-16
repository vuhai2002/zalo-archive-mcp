import { Hono } from "hono";
import { zaloPcDownloadsDir, zaloPcReceivedFilesDirs } from "../../config/account-paths.js";
import { ZaloPcMediaImportJob } from "../../daemon/zalo-pc-media-import-job.js";
import { sharedJxlPngPool } from "../../media/jxl-png-worker-pool.js";
import { checkReceivedFilesDir, chosenReceivedFilesDir, saveReceivedFilesDir } from "../../media/zalo-pc-received-files-dir-setting.js";
import { createSilentLogger } from "../../shared/logger.js";
import { pickFolderWithWindowsDialog } from "../../shared/windows-folder-picker-dialog.js";
import type { ZaloPcMediaImportStatus } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * GET /zalo-pc-media - trạng thái lượt lấy lại media từ Zalo PC của nick đang dùng;
 * POST /zalo-pc-media/start - bắt đầu một lượt (chạy nền). Chỉ đọc thư mục Zalo PC đã tải về máy, nên chạy
 * được cả khi chưa đăng nhập Zalo và cả ở chế độ Chỉ đọc (không gửi gì).
 * POST /zalo-pc-media/received-files-dir { dir | null } - đặt / bỏ chọn thư mục Zalo PC lưu file (Zalo Received Files);
 * POST /zalo-pc-media/received-files-dir/pick - mở hộp thoại chọn thư mục của Windows rồi lưu thư mục chọn được.
 */
export function zaloPcMediaRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const pool = sharedJxlPngPool(ctx.env.JXL_CONVERT_WORKERS);
  const receivedDirs = () => zaloPcReceivedFilesDirs(ctx.env, chosenReceivedFilesDir(ctx.db));
  const pickFolder = ctx.pickFolder ?? pickFolderWithWindowsDialog;
  const job = new ZaloPcMediaImportJob({
    db: ctx.db,
    mediaDir: ctx.paths.mediaDir,
    downloadsDirFor: (uid) => zaloPcDownloadsDir(ctx.env, uid),
    receivedDirs,
    log: (ctx.log ?? createSilentLogger()).child({ part: "zalo-pc-media" }),
    convertJxl: (bytes) => pool.convert(bytes),
    concurrency: pool.size,
  });
  const status = (): ZaloPcMediaImportStatus => ({
    ...job.status(),
    receivedFilesDir: chosenReceivedFilesDir(ctx.db),
    receivedFilesDirs: receivedDirs(),
  });
  app.get("/zalo-pc-media", (c) => c.json(status()));
  app.post("/zalo-pc-media/start", (c) => {
    const r = job.start();
    return r.ok ? c.json(status()) : c.json({ error: r.error }, 409);
  });
  app.post("/zalo-pc-media/received-files-dir", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { dir?: unknown } | null;
    if (body?.dir === null || body?.dir === "") {
      saveReceivedFilesDir(ctx.db, null);
      return c.json(status());
    }
    const checked = checkReceivedFilesDir(body?.dir);
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    saveReceivedFilesDir(ctx.db, checked.dir);
    return c.json(status());
  });
  // Mở hộp thoại chọn thư mục của Windows trên máy chạy daemon (yêu cầu chờ tới khi người dùng chọn / Hủy)
  let picking = false;
  app.post("/zalo-pc-media/received-files-dir/pick", async (c) => {
    if (picking) return c.json({ error: "Hộp thoại chọn thư mục đang mở trên máy tính" }, 409);
    picking = true;
    try {
      const picked = await pickFolder({ title: "Chọn thư mục Zalo PC lưu file", initialDir: chosenReceivedFilesDir(ctx.db) ?? receivedDirs()[0] ?? null });
      if (picked) {
        const checked = checkReceivedFilesDir(picked);
        if (!checked.ok) return c.json({ error: checked.error }, 400);
        saveReceivedFilesDir(ctx.db, checked.dir);
      }
      return c.json(status());
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    } finally {
      picking = false;
    }
  });
  return app;
}
