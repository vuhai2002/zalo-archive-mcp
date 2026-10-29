import { Hono } from "hono";
import { getAttachment } from "../../storage/attachment-queue-store.js";
import { requestAttachmentRetry } from "../../storage/attachment-renewal-store.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * POST /attachments/:id/retry - người dùng bấm "Thử lại" trên file tải hỏng: xin Zalo cấp lại
 * link rồi tải lại. Lệnh xin vẫn đi qua hàng của daemon (giữ khoảng cách giữa hai lần gọi Zalo).
 */
export function attachmentRetryRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.post("/attachments/:id/retry", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0 || !getAttachment(ctx.db, id)) return c.json({ error: "Không có file này" }, 404);
    if (!requestAttachmentRetry(ctx.db, id, new Date().toISOString())) {
      return c.json({ error: "File này không ở trạng thái tải hỏng" }, 409);
    }
    return c.json({ ok: true });
  });
  return app;
}
