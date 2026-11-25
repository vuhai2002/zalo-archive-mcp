import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { DashboardAppContext, DashboardContext } from "./dashboard-context.js";
import { hostGuard, requireJsonBody, requireSession } from "./dashboard-security-middleware.js";
import { accountAndSessionRoutes } from "./routes/account-and-session-routes.js";
import { appVersionRoute } from "./routes/app-version-route.js";
import { archiveBrowseRoutes } from "./routes/archive-browse-routes.js";
import { messageSearchRoutes } from "./routes/message-search-routes.js";
import { attachmentRetryRoute } from "./routes/attachment-retry-route.js";
import { dashboardPasswordRoutes } from "./routes/dashboard-password-routes.js";
import { mobileSyncRoutes } from "./routes/mobile-sync-routes.js";
import { mediaFileRoute } from "./routes/media-file-route.js";
import { threadSharedMediaRoute } from "./routes/thread-shared-media-route.js";
import { archiveLiveEventsRoute } from "./routes/archive-live-events-route.js";
import { messageDeleteRoutes } from "./routes/message-delete-routes.js";
import { messageForwardRoute } from "./routes/message-forward-route.js";
import { messageReactionRoute } from "./routes/message-reaction-route.js";
import { storageManagementRoutes } from "./routes/storage-management-routes.js";
import { outboxAndSettingsRoutes } from "./routes/outbox-and-settings-routes.js";
import { outboxUploadRoute } from "./routes/outbox-upload-route.js";
import type { Logger } from "pino";
import type { FolderPicker } from "../shared/windows-folder-picker-dialog.js";
import { zaloPcMediaRoutes } from "./routes/zalo-pc-media-routes.js";
import { pollDetailRoute } from "./routes/poll-detail-route.js";
import { zaloLabelRoute } from "./routes/zalo-label-route.js";

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

/** Route đọc kho / gửi / cài đặt / media của MỘT nick, dựng trên DB của nick đó */
function accountScopedApi(ctx: DashboardContext): Hono {
  const api = new Hono().basePath("/api");
  api.route("/", archiveBrowseRoutes(ctx));
  api.route("/", messageSearchRoutes(ctx));
  api.route("/", outboxAndSettingsRoutes(ctx));
  api.route("/", outboxUploadRoute(ctx));
  api.route("/", messageDeleteRoutes(ctx));
  api.route("/", messageForwardRoute(ctx));
  api.route("/", messageReactionRoute(ctx));
  api.route("/", storageManagementRoutes(ctx));
  api.route("/", mediaFileRoute(ctx));
  api.route("/", threadSharedMediaRoute(ctx));
  api.route("/", archiveLiveEventsRoute(ctx));
  api.route("/", attachmentRetryRoute(ctx));
  api.route("/", zaloPcMediaRoutes(ctx));
  api.route("/", pollDetailRoute(ctx));
  api.route("/", zaloLabelRoute(ctx));
  // Route /api lạ phải 404 JSON, không rơi xuống trang SPA bên dưới
  api.all("*", (c) => c.json({ error: "Không có route này" }, 404));
  return api;
}

/**
 * App Hono của dashboard: API dưới /api (Host đúng, JSON, có phiên) + giao diện
 * React đã build ở `web/dist` (SPA: đường dẫn lạ trả index.html).
 *
 * Route theo nick (kho, gửi, cài đặt, media) chạy trên DB của nick ĐANG DÙNG: mỗi
 * nick một bộ route dựng một lần, đổi nick thì yêu cầu kế tiếp đi sang bộ của nick mới.
 */
export function createDashboardApp(
  ctx: DashboardAppContext,
  opts: { webDistDir: string; allowedHosts: string[]; log?: Logger; pickFolder?: FolderPicker },
): Hono {
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
  api.route("/", dashboardPasswordRoutes(ctx));
  api.route("/", accountAndSessionRoutes(ctx));
  api.route("/", mobileSyncRoutes(ctx));
  api.route("/", appVersionRoute(ctx));
  const perAccount = new Map<string, Hono>();
  api.all("*", (c) => {
    const active = ctx.accounts.active();
    if (!active) {
      return c.json({ error: "Chưa có tài khoản Zalo nào - vào trang Tài khoản Zalo để đăng nhập bằng QR" }, 409);
    }
    let scoped = perAccount.get(active.account.id);
    if (!scoped) {
      const id = active.account.id;
      scoped = accountScopedApi({
        db: active.db,
        env: ctx.env,
        paths: active.paths,
        readOnly: () => ctx.accounts.isReadOnly(id),
        log: opts.log,
        pickFolder: opts.pickFolder,
      });
      perAccount.set(active.account.id, scoped);
    }
    return scoped.fetch(c.req.raw);
  });
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
