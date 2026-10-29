import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { DashboardContext } from "./dashboard-context.js";
import { hostGuard, requireJsonBody, requireSession } from "./dashboard-security-middleware.js";
import { archiveBrowseRoutes } from "./routes/archive-browse-routes.js";
import { authAndSessionRoutes } from "./routes/auth-and-session-routes.js";
import { outboxAndSettingsRoutes } from "./routes/outbox-and-settings-routes.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

/**
 * App Hono của dashboard: API dưới /api (Host đúng, JSON, có phiên) + giao diện
 * React đã build ở `web/dist` (SPA: đường dẫn lạ trả index.html).
 */
export function createDashboardApp(ctx: DashboardContext, opts: { webDistDir: string; allowedHosts: string[] }): Hono {
  const app = new Hono();
  app.use("*", hostGuard(opts.allowedHosts));
  app.use("*", async (c, next) => {
    await next();
    c.header("x-frame-options", "DENY");
    c.header("referrer-policy", "no-referrer");
  });

  const api = new Hono();
  api.use("*", requireJsonBody);
  api.use("*", requireSession(ctx.auth));
  api.route("/", authAndSessionRoutes(ctx));
  api.route("/", archiveBrowseRoutes(ctx));
  api.route("/", outboxAndSettingsRoutes(ctx));
  // Route /api lạ phải 404 JSON, không rơi xuống trang SPA bên dưới
  api.all("*", (c) => c.json({ error: "Không có route này" }, 404));
  app.route("/api", api);

  const distRoot = path.resolve(opts.webDistDir);
  app.get("*", (c) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text("Đường dẫn không hợp lệ", 400);
    }
    const requested = path.resolve(distRoot, `.${pathname}`);
    const insideDist = requested === distRoot || requested.startsWith(distRoot + path.sep);
    const file = insideDist && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(distRoot, "index.html");
    if (!fs.existsSync(file)) {
      return c.text("Chưa build giao diện web. Chạy: pnpm build:web", 503);
    }
    const isAsset = file.includes(`${path.sep}assets${path.sep}`);
    return c.body(fs.readFileSync(file), 200, {
      "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
      // File trong assets/ có hash trong tên nên cache lâu được; index.html thì không
      "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-store",
    });
  });
  return app;
}
