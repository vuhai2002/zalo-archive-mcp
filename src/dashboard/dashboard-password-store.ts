import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createJsonFileExclusive, readJsonFile } from "../shared/json-file-store.js";

/**
 * Mật khẩu dashboard do người dùng tạo ở lần mở đầu tiên. Chỉ lưu bản băm scrypt
 * (salt riêng) ở `data/dashboard-password.json`, không lưu chữ thật ở đâu cả.
 * Quên mật khẩu: xóa file này (`pnpm reset-password`) rồi tạo lại trên dashboard.
 */
export type PasswordRecord = { algo: "scrypt"; N: number; r: number; p: number; salt: string; hash: string };

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** N = 2^15: khoảng 100ms mỗi lần thử trên máy thường - đủ chậm để dò mật khẩu tốn công */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
// scrypt cần ~128*N*r byte bộ nhớ (32MB với tham số trên); mặc định của Node chỉ cho 32MB
const MAXMEM = 128 * 1024 * 1024;

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;

export function dashboardPasswordFile(dataDir: string): string {
  return path.join(dataDir, "dashboard-password.json");
}

/**
 * Cùng một chữ có dấu có thể tới ở hai dạng Unicode (dựng sẵn "ệ" hay "e" + dấu rời,
 * tùy bộ gõ / trình duyệt). Chuẩn hóa NFC để gõ đúng mật khẩu là luôn khớp.
 */
const normalize = (password: string) => password.normalize("NFC");

/** Câu lỗi nếu mật khẩu mới không dùng được, null nếu ổn */
export function passwordProblem(password: string): string | null {
  const n = [...normalize(password)].length;
  if (n < MIN_PASSWORD_LENGTH) return `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`;
  if (n > MAX_PASSWORD_LENGTH) return `Mật khẩu dài tối đa ${MAX_PASSWORD_LENGTH} ký tự`;
  return null;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(normalize(password), salt, KEY_BYTES, { ...PARAMS, maxmem: MAXMEM });
  return { algo: "scrypt", ...PARAMS, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

export async function verifyPassword(record: PasswordRecord, password: string): Promise<boolean> {
  // Chặn chuỗi khổng lồ trước khi băm: tránh bị dùng để làm nghẽn máy
  if (password.length > MAX_PASSWORD_LENGTH * 4) return false;
  const expected = Buffer.from(record.hash, "base64");
  const actual = await scrypt(normalize(password), Buffer.from(record.salt, "base64"), expected.length, {
    N: record.N,
    r: record.r,
    p: record.p,
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function parseRecord(raw: unknown): PasswordRecord {
  const r = raw as Partial<PasswordRecord> | null;
  const okNumber = (v: unknown, max: number) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;
  if (
    !r ||
    r.algo !== "scrypt" ||
    !okNumber(r.N, 2 ** 20) ||
    !okNumber(r.r, 32) ||
    !okNumber(r.p, 16) ||
    typeof r.salt !== "string" ||
    typeof r.hash !== "string"
  ) {
    throw new Error("File data/dashboard-password.json bị hỏng. Chạy `pnpm reset-password` rồi tạo mật khẩu mới trên dashboard.");
  }
  return { algo: "scrypt", N: r.N!, r: r.r!, p: r.p!, salt: r.salt, hash: r.hash };
}

/**
 * Đọc mật khẩu băm, nhớ theo thời điểm sửa file: xóa file bằng `pnpm reset-password`
 * trong lúc daemon đang chạy thì lần hỏi sau thấy ngay, không cần khởi động lại.
 */
export function createPasswordRecordReader(file: string): () => PasswordRecord | null {
  let cachedKey = "";
  let cached: PasswordRecord | null = null;
  return () => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      cachedKey = "";
      cached = null;
      return null;
    }
    const key = `${stat.mtimeMs}:${stat.size}`;
    if (key !== cachedKey) {
      cached = parseRecord(readJsonFile(file));
      cachedKey = key;
    }
    return cached;
  };
}

/** Ghi mật khẩu lần đầu. false nếu đã có mật khẩu (không bao giờ đè) */
export function createPasswordFile(file: string, record: PasswordRecord): boolean {
  return createJsonFileExclusive(file, { ...record, updatedAt: new Date().toISOString() });
}
