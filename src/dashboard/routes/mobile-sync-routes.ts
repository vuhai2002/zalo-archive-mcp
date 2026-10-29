import { Hono } from "hono";
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from "../../shared/local-date-range.js";
import type { MobileSyncResponse, MobileSyncStartRequest } from "../dashboard-api-contract.js";
import type { DashboardAppContext } from "../dashboard-context.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Đồng bộ lịch sử từ điện thoại cho nick đang chạy. Chỉ chạy khi người dùng bấm: Zalo trên
 * điện thoại sẽ hỏi xác nhận, đồng ý thì điện thoại gửi bản sao lưu để kho nhập tin cũ.
 */
export function mobileSyncRoutes(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const body = (): MobileSyncResponse => {
    const sync = ctx.accounts.mobileSync();
    return { available: sync !== null, status: sync?.status() ?? null };
  };

  app.get("/mobile-sync", (c) => c.json(body()));

  app.post("/mobile-sync/start", async (c) => {
    const sync = ctx.accounts.mobileSync();
    if (!sync) return c.json({ error: "Nick Zalo chưa chạy - bấm Chạy hoặc đăng nhập trước khi đồng bộ" }, 409);
    const req = (await c.req.json().catch(() => ({}))) as Partial<MobileSyncStartRequest>;
    const from = typeof req.fromDate === "string" && req.fromDate ? req.fromDate : null;
    const to = typeof req.toDate === "string" && req.toDate ? req.toDate : null;
    if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return c.json({ error: "Ngày phải dạng YYYY-MM-DD" }, 400);
    const fromIso = from ? startOfLocalDayUtc(from, tz) : null;
    const toNextIso = to ? startOfNextLocalDayUtc(to, tz) : null;
    if ((from && !fromIso) || (to && !toNextIso)) return c.json({ error: "Ngày không hợp lệ" }, 400);
    const fromTs = fromIso ? Date.parse(fromIso) : 0;
    // Hết ngày "đến": mốc 00:00 hôm sau trừ 1 ms
    const toTs = toNextIso ? Date.parse(toNextIso) - 1 : 0;
    if (fromTs && toTs && fromTs > toTs) return c.json({ error: "Ngày bắt đầu phải trước ngày kết thúc" }, 400);
    const r = await sync.start({ fromTs, toTs });
    if (!r.ok) return c.json({ error: r.error ?? "Không bắt đầu được" }, 409);
    return c.json(body());
  });

  app.post("/mobile-sync/cancel", async (c) => {
    await ctx.accounts.mobileSync()?.cancel();
    return c.json(body());
  });
  return app;
}
