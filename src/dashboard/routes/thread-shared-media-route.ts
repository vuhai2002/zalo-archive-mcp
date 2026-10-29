import { Hono } from "hono";
import { findThread } from "../../storage/message-read-queries.js";
import { threadSharedMedia } from "../../storage/thread-shared-media-queries.js";
import type { ThreadSharedMediaResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toAttachmentInfo } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Ảnh/video hoặc file của một hội thoại, mới nhất trước (bảng thông tin bên phải khung chat) */
export function threadSharedMediaRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.get("/threads/:threadId/shared", (c) => {
    const thread = findThread(ctx.db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    const kind = c.req.query("kind") === "file" ? "file" : "visual";
    const page = threadSharedMedia(ctx.db, {
      threadId: thread.threadId,
      threadType: thread.threadType,
      kind,
      limit: clampInt(c.req.query("limit"), 8, 1, 120),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    const items = page.items.map((a) => ({ ...toAttachmentInfo(a), sentAt: a.sentAt }));
    return c.json({ items, total: page.total } satisfies ThreadSharedMediaResponse);
  });
  return app;
}
