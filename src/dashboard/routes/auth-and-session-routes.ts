import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../dashboard-auth.js";
import type { LoginRequest, MeResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";

/** Đăng nhập dashboard + điều khiển phiên Zalo (QR, chạy, dừng, đăng xuất) */
export function authAndSessionRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const me = (): MeResponse => ({
    ok: true,
    accountId: ctx.env.ZALO_ACCOUNT_ID,
    timeZone: ctx.env.ARCHIVE_TIMEZONE,
    version: ctx.version,
  });

  app.post("/auth/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<LoginRequest>;
    if (typeof body.password !== "string" || !ctx.auth.checkPassword(body.password)) {
      return c.json({ error: "Sai mật khẩu" }, 401);
    }
    setCookie(c, SESSION_COOKIE, ctx.auth.createToken(), {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return c.json(me());
  });

  app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // /auth/* được đi qua requireSession, nên tự kiểm phiên ở đây
  app.get("/auth/me", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    return ctx.auth.verifyToken(token) ? c.json(me()) : c.json({ error: "Chưa đăng nhập dashboard" }, 401);
  });

  app.get("/session", (c) => c.json(ctx.session.status()));
  app.post("/session/login-qr", (c) => {
    ctx.session.startQrLogin();
    return c.json(ctx.session.status());
  });
  app.post("/session/start", async (c) => {
    await ctx.session.start();
    return c.json(ctx.session.status());
  });
  app.post("/session/stop", (c) => {
    ctx.session.stop();
    return c.json(ctx.session.status());
  });
  app.post("/session/logout", (c) => {
    ctx.session.logout();
    return c.json(ctx.session.status());
  });
  return app;
}
