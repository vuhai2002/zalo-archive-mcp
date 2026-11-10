import { Hono } from "hono";
import type { DashboardContext } from "../dashboard-context.js";
import { toPollView } from "../poll-view-mapper.js";
import type { PollView } from "../poll-view-contract.js";

/** Cửa sổ Xem bình chọn (chỉ đọc): chi tiết daemon đã lấy từ Zalo, kèm tên + avatar người chọn theo danh bạ */
export function pollDetailRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.get("/polls/:pollId", (c) => {
    const pollId = c.req.param("pollId");
    if (!/^\d{1,20}$/.test(pollId)) return c.json({ error: "Mã bình chọn không hợp lệ" }, 400);
    const view = toPollView(ctx.db, pollId);
    if (!view) return c.json({ error: "Kho chưa có cuộc bình chọn này" }, 404);
    return c.json(view satisfies PollView);
  });
  return app;
}
