import path from "node:path";

/**
 * Chặn cứng file rõ ràng là bí mật khi gửi file qua Zalo (người dùng chốt 2026-11-09): kể cả khi người dùng đã duyệt, một tin
 * nhắn "lừa" cũng không khiến Claude gửi được khóa / mật khẩu đi. Chỉ chặn loại chắc chắn bí mật, không chặn theo thư mục.
 */
const SECRET_NAMES = new Set([
  ".npmrc",
  ".netrc",
  ".pypirc",
  ".git-credentials",
  ".pgpass",
  "credentials",
  "credentials.json",
  "credentials.enc",
  "known_hosts",
  "authorized_keys",
]);
/** Khóa riêng, kho chứng chỉ, kho mật khẩu */
const SECRET_EXT = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".ppk", ".kdbx", ".gpg", ".asc"]);
/** Thư mục cất khóa của các công cụ: mọi file trong đó */
const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg", ".azure", ".kube", ".docker"]);
/** File mẫu cấu hình (.env.example...) không chứa bí mật thật */
const TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/i;

/** Lý do chặn (null = gửi được). `filePath` là đường dẫn tuyệt đối trên máy */
export function secretFileReason(filePath: string): string | null {
  const name = path.basename(filePath).toLowerCase();
  const dirs = path.dirname(filePath).toLowerCase().split(/[\\/]+/);
  if (dirs.some((d) => SECRET_DIRS.has(d))) return "nằm trong thư mục cất khóa / mật khẩu";
  if ((name === ".env" || name.startsWith(".env.")) && !TEMPLATE_SUFFIX.test(name)) return "file biến môi trường (.env) thường chứa mật khẩu, khóa API";
  if (SECRET_NAMES.has(name)) return "file chứa mật khẩu / thông tin đăng nhập";
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return "khóa SSH riêng";
  if (SECRET_EXT.has(path.extname(name))) return "khóa / chứng chỉ / kho mật khẩu";
  return null;
}
