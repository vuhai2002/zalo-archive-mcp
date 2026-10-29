import { Hono, type Context } from "hono";
import { UnknownAccountError } from "../../daemon/zalo-account-manager.js";
import { LoginCooldownError } from "../../daemon/zalo-login-cooldown.js";
import type { AccountsResponse } from "../dashboard-api-contract.js";
import type { DashboardAppContext } from "../dashboard-context.js";

/** Danh sách nick, đổi nick, và điều khiển phiên Zalo của nick đang dùng (QR, chạy, dừng, đăng xuất) */
export function accountAndSessionRoutes(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  const { accounts } = ctx;

  /** Chạy một thao tác rồi trả trạng thái phiên; lỗi biết trước thành câu báo dễ hiểu */
  const act = async (c: Context, work: () => unknown) => {
    try {
      await work();
    } catch (err) {
      if (err instanceof LoginCooldownError) return c.json({ error: err.message }, 429);
      if (err instanceof UnknownAccountError) return c.json({ error: err.message }, 404);
      throw err;
    }
    return c.json(accounts.status());
  };

  app.get("/accounts", (c) => c.json({ accounts: accounts.accounts() } satisfies AccountsResponse));
  app.post("/accounts/:id/activate", (c) => act(c, () => accounts.switchTo(c.req.param("id"))));
  // Bật / tắt Chỉ đọc. Mở gửi là quyết định của người dùng: dashboard hỏi xác nhận trước khi gọi
  app.post("/accounts/:id/read-only", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { readOnly?: unknown } | null;
    if (typeof body?.readOnly !== "boolean") return c.json({ error: "readOnly phải là true hoặc false" }, 400);
    try {
      accounts.setReadOnly(c.req.param("id"), body.readOnly);
    } catch (err) {
      if (err instanceof UnknownAccountError) return c.json({ error: err.message }, 404);
      throw err;
    }
    return c.json({ accounts: accounts.accounts() } satisfies AccountsResponse);
  });

  app.get("/session", (c) => c.json(accounts.status()));
  app.post("/session/login-qr", (c) => act(c, () => accounts.startQrLogin()));
  app.post("/session/start", (c) => act(c, () => accounts.startActive()));
  app.post("/session/stop", (c) => act(c, () => accounts.stopActive()));
  app.post("/session/logout", (c) => act(c, () => accounts.logoutActive()));
  return app;
}
