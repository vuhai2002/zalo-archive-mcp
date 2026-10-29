import path from "node:path";
import { serve } from "@hono/node-server";
import type { Logger } from "pino";
import { PROJECT_ROOT } from "../config/env.js";
import type { DashboardAppContext } from "./dashboard-context.js";
import { createDashboardApp } from "./create-dashboard-app.js";

/** Mở dashboard trên DASHBOARD_HOST:DASHBOARD_PORT (mặc định chỉ máy này). Trả hàm đóng. */
export function startDashboardServer(ctx: DashboardAppContext, log: Logger): () => void {
  const { DASHBOARD_HOST: host, DASHBOARD_PORT: port } = ctx.env;
  const allowedHosts = [`${host}:${port}`, `127.0.0.1:${port}`, `localhost:${port}`];
  const app = createDashboardApp(ctx, { webDistDir: path.join(PROJECT_ROOT, "web", "dist"), allowedHosts });
  const server = serve({ fetch: app.fetch, hostname: host, port }, () => {
    log.info(`Dashboard: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
  });
  server.on("error", (err) => log.error({ err }, "Không mở được dashboard (cổng đang bị dùng?)"));
  return () => {
    server.close();
  };
}
