import { Hono } from "hono";
import { readZaloLabels } from "../../storage/zalo-label-store.js";
import type { ZaloLabelsResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/** Thẻ Phân loại của Zalo (chỉ đọc) cho hộp chọn hội thoại của chế độ trình chiếu; chỉ giữ hội thoại kho có */
export function zaloLabelRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.get("/labels", (c) => {
    const { labels, syncedAt } = readZaloLabels(ctx.db);
    const known = ctx.db.prepare("SELECT 1 FROM threads WHERE thread_id = ? AND thread_type = ?");
    return c.json({
      labels: labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        emoji: l.emoji,
        threadIds: l.conversations.filter((t) => known.get(t.threadId, t.threadType) !== undefined).map((t) => t.threadId),
      })),
      syncedAt,
    } satisfies ZaloLabelsResponse);
  });
  return app;
}
