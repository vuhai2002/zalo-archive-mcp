import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createArchiveChangeFeed } from "../archive-change-feed.js";
import type { DashboardContext } from "../dashboard-context.js";

/** Tín hiệu "vẫn sống" để kết nối đứng im không bị cắt giữa chừng */
const KEEPALIVE_MS = 25_000;

/**
 * GET /api/events - dashboard tự cập nhật bằng Server-Sent Events. Mỗi khi kho có tin / cảm xúc /
 * thu hồi / file vừa tải xong, gửi sự kiện `change` với `{ threadIds }`; trình duyệt tự tải lại
 * đúng phần đó. Cookie phiên đã kiểm ở tầng /api như mọi route khác.
 */
export function archiveLiveEventsRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  const feed = createArchiveChangeFeed(ctx.db, ctx.env.DASHBOARD_LIVE_CHECK_MS);

  app.get("/events", (c) => {
    c.header("cache-control", "no-store");
    return streamSSE(c, async (stream) => {
      let closed = false;
      let wake: (() => void) | null = null;
      const unsubscribe = feed.subscribe((threadIds) => {
        void stream.writeSSE({ event: "change", data: JSON.stringify({ threadIds }) });
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
        wake?.();
      });
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!closed) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, KEEPALIVE_MS).unref?.();
        });
        if (!closed) await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });
  return app;
}
