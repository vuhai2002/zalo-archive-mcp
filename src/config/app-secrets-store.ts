import crypto from "node:crypto";
import path from "node:path";
import { createJsonFileExclusive, readJsonFile } from "../shared/json-file-store.js";

/**
 * Khóa của app, tự sinh lần chạy đầu và cất ở `data/app-secrets.json` - người dùng
 * không phải tạo hay chép khóa vào `.env`:
 * - `credentialsKeyHex`: mã hóa cookie Zalo của mọi nick (AES-256-GCM).
 * - `sessionSecretHex`: ký cookie phiên dashboard.
 *
 * Máy đã chạy bản cũ có `CREDENTIALS_ENCRYPTION_KEY` trong `.env`: lần đầu lấy đúng
 * khóa đó làm `credentialsKeyHex`, nếu không cookie đã lưu sẽ không giải mã được.
 * File đã có thì KHÔNG bao giờ sinh lại: mất khóa là mất mọi cookie đã lưu.
 */
export type AppSecrets = { credentialsKeyHex: string; sessionSecretHex: string };

const HEX_32_BYTES = /^[0-9a-f]{64}$/i;

export function appSecretsFile(dataDir: string): string {
  return path.join(dataDir, "app-secrets.json");
}

function parseSecrets(raw: unknown): AppSecrets {
  const r = raw as Partial<AppSecrets> | null;
  if (!r || !HEX_32_BYTES.test(String(r.credentialsKeyHex)) || !HEX_32_BYTES.test(String(r.sessionSecretHex))) {
    throw new Error("File data/app-secrets.json thiếu hoặc sai khóa. Khôi phục từ bản sao lưu - KHÔNG xóa file (sẽ mất cookie đã lưu).");
  }
  return { credentialsKeyHex: String(r.credentialsKeyHex), sessionSecretHex: String(r.sessionSecretHex) };
}

/**
 * Đọc khóa; chưa có thì tạo. `legacyMismatch`: `.env` còn khóa cũ KHÁC khóa trong
 * file (file thắng) - caller ghi cảnh báo để người dùng biết dòng đó không còn tác dụng.
 */
export function loadOrCreateAppSecrets(
  dataDir: string,
  legacyCredentialsKeyHex?: string,
): { secrets: AppSecrets; created: boolean; legacyMismatch: boolean } {
  const file = appSecretsFile(dataDir);
  const existing = readJsonFile(file);
  if (existing === null) {
    const fresh: AppSecrets = {
      credentialsKeyHex: legacyCredentialsKeyHex?.toLowerCase() ?? crypto.randomBytes(32).toString("hex"),
      sessionSecretHex: crypto.randomBytes(32).toString("hex"),
    };
    // Hai tiến trình cùng tạo (daemon + lệnh login): bên tạo sau đọc lại file của bên trước
    if (createJsonFileExclusive(file, { ...fresh, createdAt: new Date().toISOString() })) {
      return { secrets: fresh, created: true, legacyMismatch: false };
    }
    return loadOrCreateAppSecrets(dataDir, legacyCredentialsKeyHex);
  }
  const secrets = parseSecrets(existing);
  const legacyMismatch =
    legacyCredentialsKeyHex !== undefined && legacyCredentialsKeyHex.toLowerCase() !== secrets.credentialsKeyHex.toLowerCase();
  return { secrets, created: false, legacyMismatch };
}
