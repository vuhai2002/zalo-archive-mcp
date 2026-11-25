import { Hono } from "hono";
import type { UpdateInfo } from "../../shared/github-release-update-check.js";
import type { DashboardAppContext } from "../dashboard-context.js";

/**
 * GET /version - bản đang chạy + có bản mới trên GitHub Release không (cache + bỏ qua lỗi nằm trong bộ kiểm tra). Dashboard
 * dùng để hiện nút "Có bản mới", bấm ra prompt đưa agent tự cập nhật. Không theo nick.
 * POST /version/check - nút "Kiểm tra cập nhật": hỏi GitHub ngay (bộ kiểm tra giữ tối thiểu 1 phút giữa hai lần hỏi thật).
 * GET /about - mục Giới thiệu: phiên bản, tác giả, link repo (đọc từ package.json).
 */
export function appVersionRoute(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  const off: UpdateInfo = { enabled: false, current: ctx.version, latest: null, updateAvailable: false, releaseUrl: null, notes: null, checkedAt: null };
  const answer = async (force: boolean): Promise<UpdateInfo> => {
    if (!ctx.updates) return off;
    try {
      return await ctx.updates.check({ force });
    } catch {
      return { ...off, enabled: true };
    }
  };
  app.get("/version", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await answer(false));
  });
  app.post("/version/check", async (c) => c.json(await answer(true)));
  app.get("/about", (c) => c.json(ctx.about ?? { version: ctx.version, authorName: null, authorUrl: null, repoUrl: null }));
  return app;
}
