import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../dashboard-auth.js";
import type { AuthStatusResponse, LoginRequest, MeResponse, SetupRequest } from "../dashboard-api-contract.js";
import type { DashboardAppContext } from "../dashboard-context.js";
import { LoginAttemptLimiter } from "../login-attempt-limiter.js";

/**
 * Mật khẩu dashboard: tạo lần đầu (khi chưa có), đăng nhập, đăng xuất. Các route
 * này đi qua được khi chưa có phiên, nên tự kiểm những gì cần kiểm.
 */
export function dashboardPasswordRoutes(ctx: DashboardAppContext): Hono {
  const app = new Hono();
  const limiter = new LoginAttemptLimiter({ maxFailures: 5, windowMs: 10 * 60_000, lockMs: 60_000 });
  const me = (): MeResponse => ({ ok: true, timeZone: ctx.env.ARCHIVE_TIMEZONE, version: ctx.version });
  const startSession = (c: Context) =>
    setCookie(c, SESSION_COOKIE, ctx.auth.createToken(), {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });

  app.get("/auth/status", (c) =>
    c.json({
      passwordSet: ctx.auth.isPasswordSet(),
      loggedIn: ctx.auth.verifyToken(getCookie(c, SESSION_COOKIE)),
    } satisfies AuthStatusResponse),
  );

  app.post("/auth/setup", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<SetupRequest>;
    if (typeof body.password !== "string" || typeof body.confirm !== "string") {
      return c.json({ error: "Thiếu mật khẩu hoặc phần nhập lại" }, 400);
    }
    if (body.password !== body.confirm) return c.json({ error: "Hai lần nhập mật khẩu không khớp" }, 400);
    const result = await ctx.auth.setupPassword(body.password);
    if (!result.ok) return c.json({ error: result.message }, result.reason === "already_set" ? 409 : 400);
    startSession(c);
    return c.json(me());
  });

  app.post("/auth/login", async (c) => {
    if (!ctx.auth.isPasswordSet()) return c.json({ error: "Chưa tạo mật khẩu dashboard" }, 409);
    const locked = limiter.secondsLocked();
    if (locked > 0) return c.json({ error: `Sai mật khẩu quá nhiều lần - thử lại sau ${locked} giây` }, 429);
    const body = (await c.req.json().catch(() => ({}))) as Partial<LoginRequest>;
    if (typeof body.password !== "string" || !(await ctx.auth.checkPassword(body.password))) {
      limiter.recordFailure();
      return c.json({ error: "Sai mật khẩu" }, 401);
    }
    limiter.recordSuccess();
    startSession(c);
    return c.json(me());
  });

  app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/auth/me", (c) =>
    ctx.auth.verifyToken(getCookie(c, SESSION_COOKIE)) ? c.json(me()) : c.json({ error: "Chưa đăng nhập dashboard" }, 401),
  );
  return app;
}
