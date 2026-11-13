import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, type DashboardAuth } from "./dashboard-auth.js";

/**
 * Chặn yêu cầu có Host lạ: chống DNS rebinding (một trang web độc trỏ tên miền
 * của nó về 127.0.0.1 rồi gọi API dashboard từ trình duyệt của người dùng).
 */
export function hostGuard(allowedHosts: string[]): MiddlewareHandler {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!allowed.has(host)) return c.json({ error: "Host không được phép" }, 403);
    await next();
  };
}

/** Route duy nhất nhận dữ liệu thô: tải file lên để gửi (xem outbox-upload-route.ts) */
export const UPLOAD_PATH = "/api/outbox/uploads";

/**
 * Route ghi phải gửi JSON: form HTML của trang khác không gửi được
 * `application/json` mà không qua preflight CORS (server không mở CORS), nên
 * cùng cookie SameSite=Strict đây là lớp chặn CSRF. Riêng route tải file nhận
 * `application/octet-stream` - kiểu này cũng phải qua preflight nên chặn y như vậy.
 */
export const requireJsonBody: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "PUT") {
    const type = c.req.header("content-type") ?? "";
    if (c.req.path === UPLOAD_PATH && type.toLowerCase().startsWith("application/octet-stream")) return next();
    if (!type.toLowerCase().startsWith("application/json")) {
      return c.json({ error: "Cần Content-Type: application/json" }, 415);
    }
  }
  await next();
};

/** Mọi route /api trừ /api/auth/* đòi phiên hợp lệ */
export function requireSession(auth: DashboardAuth): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();
    if (!auth.verifyToken(getCookie(c, SESSION_COOKIE))) return c.json({ error: "Chưa đăng nhập dashboard" }, 401);
    await next();
  };
}
