import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Cookie Zalo = toàn quyền tài khoản, nên mã hóa AES-256-GCM khi lưu đĩa.
 * Layout file: [iv 12 byte][authTag 16 byte][ciphertext]. Lấy từ zalo-agent.
 */
export type StoredCredentials = {
  cookie: unknown;
  imei: string;
  userAgent: string;
};

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function saveCredentials(file: string, keyHex: string, creds: StoredCredentials): void {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(creds), "utf-8"), cipher.final()]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Ghi file tạm rồi đổi tên: chết giữa chừng không để lại credential hỏng nửa vời
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function loadCredentials(file: string, keyHex: string): StoredCredentials | null {
  if (!fs.existsSync(file)) return null;
  const payload = fs.readFileSync(file);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), payload.subarray(0, IV_BYTES));
  decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    const plain = Buffer.concat([decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    return JSON.parse(plain.toString("utf-8")) as StoredCredentials;
  } catch {
    throw new Error(
      `Không giải mã được ${file}: CREDENTIALS_ENCRYPTION_KEY khác khóa lúc đăng nhập, hoặc file hỏng. Chạy lại "pnpm login".`,
    );
  }
}
