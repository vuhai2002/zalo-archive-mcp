import { Hono } from "hono";
import { deleteMessagesFromArchive, MAX_DELETE_PER_REQUEST, previewMessageDeletion } from "../../archive/delete-messages-from-archive.js";
import type { MessageDeleteRequest, MessageDeletePreview, MessageDeleteResult } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/** Số tin trong kho hợp lệ: mảng số nguyên dương, không rỗng, không quá trần mỗi lần */
function parseIds(body: Partial<MessageDeleteRequest> | null): number[] | string {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return "Chưa chọn tin nào";
  if (ids.length > MAX_DELETE_PER_REQUEST) return `Mỗi lần xóa tối đa ${MAX_DELETE_PER_REQUEST} tin`;
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) return "ids phải là số tin trong kho";
  return ids;
}

/**
 * Xóa tin khỏi KHO (không đụng Zalo): xem trước cái sẽ mất cho hộp xác nhận, rồi xóa thật. Xóa cả trên nick Chỉ đọc
 * vì chỉ đụng dữ liệu trên máy, không gọi Zalo.
 */
export function messageDeleteRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const idsOf = async (req: Request) => parseIds((await req.json().catch(() => null)) as Partial<MessageDeleteRequest> | null);

  app.post("/messages/delete-preview", async (c) => {
    const ids = await idsOf(c.req.raw);
    if (typeof ids === "string") return c.json({ error: ids }, 400);
    return c.json(previewMessageDeletion(ctx.db, ids) satisfies MessageDeletePreview);
  });

  app.post("/messages/delete", async (c) => {
    const ids = await idsOf(c.req.raw);
    if (typeof ids === "string") return c.json({ error: ids }, 400);
    const r = deleteMessagesFromArchive(ctx.db, ctx.paths.mediaDir, ids);
    return c.json(r satisfies MessageDeleteResult);
  });
  return app;
}
