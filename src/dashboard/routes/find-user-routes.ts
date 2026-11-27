import { Hono } from "hono";
import { contactCardOf } from "../../archive/zalo-contact-card.js";
import { searchPhoneInteractive } from "../../phone-lookup/interactive-phone-search.js";
import { normalizeVnPhone } from "../../phone-lookup/phone-lookup-rules.js";
import { ensureUserThread } from "../../storage/ensure-user-thread.js";
import type { DashboardAppContext } from "../dashboard-context.js";

/**
 * Tìm / mở hội thoại với một người chưa nhắn trong kho:
 * - POST /phone-search { phone } - gõ số điện thoại vào ô Tìm kiếm (như Zalo PC): số kho đã tra thì trả ngay, chưa thì hỏi
 *   Zalo một lần bằng phiên đang chạy (interactive-phone-search.ts). Chỉ đọc / listener rớt thì không hỏi Zalo.
 * - POST /messages/:id/contact-card/open - nút "Nhắn tin" trên danh thiếp: thêm người trên danh thiếp vào kho (đọc từ tin
 *   trong DB, không nhận tên / mã từ yêu cầu) rồi trả mã hội thoại để mở.
 * Theo nick đang dùng; chưa có nick thì 409.
 */
export function findUserRoutes(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  const noNick = { error: "Chưa có tài khoản Zalo nào" } as const;

  app.post("/phone-search", async (c) => {
    const active = ctx.accounts.active();
    if (!active) return c.json(noNick, 409);
    const body = (await c.req.json().catch(() => null)) as { phone?: unknown } | null;
    const phone = typeof body?.phone === "string" ? normalizeVnPhone(body.phone) : null;
    if (!phone) return c.json({ error: "Không phải số điện thoại di động Việt Nam" }, 400);
    const blockedReason = ctx.accounts.isReadOnly(active.account.id)
      ? "Nick đang ở chế độ Chỉ đọc nên không tra số trên Zalo"
      : !ctx.accounts.status().listenerConnected
        ? "Chưa kết nối Zalo nên chưa tra được số này"
        : null;
    return c.json(await searchPhoneInteractive(active.db, phone, { lookup: ctx.accounts.phoneLookup(), blockedReason }));
  });

  app.post("/messages/:id/contact-card/open", (c) => {
    const active = ctx.accounts.active();
    if (!active) return c.json(noNick, 409);
    const id = Number(c.req.param("id"));
    const row = Number.isInteger(id) && id > 0
      ? (active.db
          .prepare("SELECT json_extract(raw_json, '$.content') AS content FROM messages WHERE id = ? AND msg_type = 'chat.recommended' AND json_valid(raw_json)")
          .get(id) as { content: unknown } | undefined)
      : undefined;
    let content: unknown = row?.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch {
        content = null;
      }
    }
    const card = contactCardOf(content);
    if (!card) return c.json({ error: "Tin này không phải danh thiếp" }, 404);
    ensureUserThread(active.db, { uid: card.userId, name: card.name, avatarUrl: card.avatarUrl }, new Date().toISOString(), { keepKnownContact: true });
    return c.json({ threadId: card.userId });
  });

  return app;
}
