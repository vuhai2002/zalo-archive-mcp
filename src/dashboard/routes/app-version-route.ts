import { Hono } from "hono";
import type { UpdateInfo } from "../../shared/github-release-update-check.js";
import type { DashboardAppContext } from "../dashboard-context.js";

/**
 * GET /version - bản đang chạy + có bản mới trên GitHub Release không (cache + bỏ qua lỗi nằm trong bộ kiểm tra). Dashboard
 * dùng để hiện nút "Có bản mới", bấm ra prompt đưa agent tự cập nhật. Không theo nick.
 */
export function appVersionRoute(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  app.get("/version", async (c) => {
    c.header("cache-control", "no-store");
    const off: UpdateInfo = { enabled: false, current: ctx.version, latest: null, updateAvailable: false, releaseUrl: null, notes: null };
    if (!ctx.updates) return c.json(off);
    try {
      return c.json(await ctx.updates.check());
    } catch {
      return c.json({ ...off, enabled: true });
    }
  });
  return app;
}
