import { Hono } from "hono";
import { saveUpload, UploadRejected } from "../../outbox/dashboard-upload-store.js";
import { READ_ONLY_ERROR } from "../../outbox/enqueue-outbox-request.js";
import type { OutboxUploadResult } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/**
 * Tải một file lên để gửi (nút Gửi hình ảnh / Đính kèm File / dán ảnh của khung soạn tin): thân yêu cầu là dữ liệu thô
 * `application/octet-stream`, tên file trong `?name=`. Kiểu dữ liệu này không gửi được từ trang khác mà không qua preflight
 * CORS (server không mở CORS), nên giữ được lớp chặn CSRF như các route JSON. Chỉ lưu file, chưa gửi gì.
 */
export function outboxUploadRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.post("/outbox/uploads", async (c) => {
    if (ctx.readOnly()) return c.json({ error: READ_ONLY_ERROR }, 409);
    const declared = Number(c.req.header("content-length"));
    try {
      const up = await saveUpload(ctx.paths.outboxFilesDir, c.req.query("name"), c.req.raw.body, Number.isFinite(declared) ? declared : null);
      return c.json(up satisfies OutboxUploadResult);
    } catch (err) {
      if (err instanceof UploadRejected) return c.json({ error: err.message }, err.status);
      ctx.log?.warn({ err }, "Tải file lên để gửi bị lỗi");
      return c.json({ error: "Tải file lên bị lỗi - thử lại." }, 500);
    }
  });
  return app;
}
