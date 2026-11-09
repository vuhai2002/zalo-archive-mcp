import { Hono } from "hono";
import { enqueueForward } from "../../outbox/enqueue-forward-request.js";
import type { ForwardRequestBody, ForwardResult } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * POST /messages/:id/forward - hộp "Chia sẻ" trên dashboard: chuyển tiếp tin tới tối đa 100 hội thoại, kèm lời nhắn tùy
 * chọn. Chỉ GHI vào hàng đợi; daemon gửi lần lượt. Nick Chỉ đọc thì từ chối.
 */
export function messageForwardRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.post("/messages/:id/forward", async (c) => {
    const messageId = Number(c.req.param("id"));
    const body = (await c.req.json().catch(() => null)) as Partial<ForwardRequestBody> | null;
    if (!Number.isInteger(messageId) || messageId <= 0) return c.json({ error: "Số tin không hợp lệ" }, 400);
    if (!Array.isArray(body?.threadIds) || !body.threadIds.every((t) => typeof t === "string" && t.length > 0 && t.length <= 64)) {
      return c.json({ error: "threadIds phải là danh sách mã hội thoại" }, 400);
    }
    if (body.note !== undefined && typeof body.note !== "string") return c.json({ error: "note phải là chữ" }, 400);
    const r = enqueueForward(
      { db: ctx.db, env: ctx.env, readOnly: ctx.readOnly() },
      { messageId, threadIds: body.threadIds, note: body.note, createdBy: "dashboard" },
    );
    if (!r.ok) return c.json({ error: r.error }, 400);
    return c.json({ ids: r.ids, batchId: r.batchId! } satisfies ForwardResult);
  });
  return app;
}
