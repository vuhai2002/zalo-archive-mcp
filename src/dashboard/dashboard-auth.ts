import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createPasswordFile,
  createPasswordRecordReader,
  hashPassword,
  passwordProblem,
  verifyPassword,
  type PasswordRecord,
} from "./dashboard-password-store.js";

/**
 * Phiên dashboard: cookie mang token tự ký HMAC `<hết hạn>.<chữ ký>`.
 *
 * Khóa ký dẫn xuất từ khóa bí mật của app VÀ bản băm mật khẩu hiện tại: đặt lại
 * mật khẩu là mọi phiên cũ hết hiệu lực ngay. Dashboard chỉ nghe 127.0.0.1 và một
 * người dùng, nên không cần bảng phiên để thu hồi từng phiên như zalo-agent.
 */
export const SESSION_COOKIE = "zam_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SetupResult = { ok: true } | { ok: false; reason: "already_set" | "invalid"; message: string };

export type DashboardAuth = {
  isPasswordSet: () => boolean;
  /** Tạo mật khẩu lần đầu; đã có mật khẩu thì từ chối (đổi thì phải đặt lại) */
  setupPassword: (password: string) => Promise<SetupResult>;
  checkPassword: (input: string) => Promise<boolean>;
  createToken: (nowMs?: number) => string;
  verifyToken: (token: string | undefined, nowMs?: number) => boolean;
};

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function createDashboardAuth(opts: { passwordFile: string; sessionSecretHex: string }): DashboardAuth {
  const readRecord = createPasswordRecordReader(opts.passwordFile);
  const secret = Buffer.from(opts.sessionSecretHex, "hex");
  const signingKey = (record: PasswordRecord) => hmac(secret, `dashboard-session:${record.hash}`);

  return {
    isPasswordSet: () => readRecord() !== null,
    setupPassword: async (password) => {
      if (readRecord()) return { ok: false, reason: "already_set", message: "Đã có mật khẩu - hãy đăng nhập" };
      const problem = passwordProblem(password);
      if (problem) return { ok: false, reason: "invalid", message: problem };
      // Hai tab cùng bấm tạo: chỉ một bên ghi được file, bên kia nhận already_set
      if (!createPasswordFile(opts.passwordFile, await hashPassword(password))) {
        return { ok: false, reason: "already_set", message: "Đã có mật khẩu - hãy đăng nhập" };
      }
      return { ok: true };
    },
    checkPassword: async (input) => {
      const record = readRecord();
      return record !== null && (await verifyPassword(record, input));
    },
    createToken: (nowMs = Date.now()) => {
      const record = readRecord();
      if (!record) throw new Error("Chưa có mật khẩu dashboard");
      const expires = String(nowMs + SESSION_TTL_MS);
      return `${expires}.${hmac(signingKey(record), expires).toString("base64url")}`;
    },
    verifyToken: (token, nowMs = Date.now()) => {
      const record = readRecord();
      if (!token || !record) return false;
      const dot = token.indexOf(".");
      if (dot <= 0) return false;
      const expires = token.slice(0, dot);
      const given = Buffer.from(token.slice(dot + 1), "base64url");
      const expected = hmac(signingKey(record), expires);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
      return Number(expires) > nowMs;
    },
  };
}
