import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phiên dashboard: cookie mang token tự ký HMAC `<hết hạn>.<chữ ký>`.
 *
 * Khóa ký dẫn xuất từ CẢ mật khẩu dashboard lẫn khóa mã hóa credential: đổi
 * mật khẩu là mọi phiên cũ hết hiệu lực ngay. Dashboard chỉ nghe 127.0.0.1 và
 * một người dùng, nên không cần bảng phiên để thu hồi từng phiên như zalo-agent.
 */
export const SESSION_COOKIE = "zam_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DashboardAuth = {
  checkPassword: (input: string) => boolean;
  createToken: (nowMs?: number) => string;
  verifyToken: (token: string | undefined, nowMs?: number) => boolean;
};

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function createDashboardAuth(password: string, credentialsKeyHex: string): DashboardAuth {
  const signingKey = createHash("sha256").update(`${credentialsKeyHex}:dashboard:${password}`).digest();
  // So sánh qua HMAC để độ dài hai vế luôn bằng nhau (timingSafeEqual đòi bằng nhau)
  const passwordDigest = hmac(signingKey, password);

  return {
    checkPassword: (input) => timingSafeEqual(hmac(signingKey, input), passwordDigest),
    createToken: (nowMs = Date.now()) => {
      const expires = String(nowMs + SESSION_TTL_MS);
      return `${expires}.${hmac(signingKey, expires).toString("base64url")}`;
    },
    verifyToken: (token, nowMs = Date.now()) => {
      if (!token) return false;
      const dot = token.indexOf(".");
      if (dot <= 0) return false;
      const expires = token.slice(0, dot);
      const given = Buffer.from(token.slice(dot + 1), "base64url");
      const expected = hmac(signingKey, expires);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
      return Number(expires) > nowMs;
    },
  };
}
