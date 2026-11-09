import { Hono } from "hono";
import { READ_ONLY_ERROR } from "../../outbox/enqueue-outbox-request.js";
import { reactToArchivedMessage } from "../../outbox/request-message-reaction.js";
import type { ReactRequest, ReactResult } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

const WAIT_MS = 8_000;

/**
 * POST /messages/:id/react { icon } - thả cảm xúc vào tin như Zalo. Ghi yêu cầu cho daemon rồi chờ tối đa vài giây để báo
 * kết quả; quá giờ thì bỏ yêu cầu (không thả muộn). Cảm xúc hiện trên tin khi listener ghi lại (dashboard tự tải lại).
 */
export function messageReactionRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.post("/messages/:id/react", async (c) => {
    const id = Number(c.req.param("id"));
    const body = (await c.req.json().catch(() => null)) as Partial<ReactRequest> | null;
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Số tin không hợp lệ" }, 400);
    if (typeof body?.icon !== "string") return c.json({ error: "Cảm xúc không hợp lệ" }, 400);
    if (ctx.readOnly()) return c.json({ error: READ_ONLY_ERROR }, 400);
    const r = await reactToArchivedMessage(ctx.db, id, body.icon, { waitMs: WAIT_MS });
    if (r.ok) return c.json({ ok: true } satisfies ReactResult);
    return c.json({ error: r.error }, r.timedOut ? 504 : 400);
  });
  return app;
}
