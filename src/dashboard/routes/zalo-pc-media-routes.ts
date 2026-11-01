import { Hono } from "hono";
import { zaloPcDownloadsDir } from "../../config/account-paths.js";
import { ZaloPcMediaImportJob } from "../../daemon/zalo-pc-media-import-job.js";
import { createSilentLogger } from "../../shared/logger.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * GET /zalo-pc-media - trạng thái lượt lấy lại media từ Zalo PC của nick đang dùng;
 * POST /zalo-pc-media/start - bắt đầu một lượt (chạy nền). Chỉ đọc thư mục Zalo PC đã tải về máy, nên chạy
 * được cả khi chưa đăng nhập Zalo và cả ở chế độ Chỉ đọc (không gửi gì).
 */
export function zaloPcMediaRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const job = new ZaloPcMediaImportJob({
    db: ctx.db,
    mediaDir: ctx.paths.mediaDir,
    downloadsDirFor: (uid) => zaloPcDownloadsDir(ctx.env, uid),
    log: (ctx.log ?? createSilentLogger()).child({ part: "zalo-pc-media" }),
  });
  app.get("/zalo-pc-media", (c) => c.json(job.status()));
  app.post("/zalo-pc-media/start", (c) => {
    const r = job.start();
    return r.ok ? c.json(job.status()) : c.json({ error: r.error }, 409);
  });
  return app;
}
