/**
 * Chỉ nhận `next` (sau đăng nhập đi tiếp tới đâu) là đường dẫn NỘI BỘ.
 * "//evil.com" hay "/\evil.com" trình duyệt hiểu là URL tới host khác - để lọt
 * thì trang đăng nhập thành bàn đạp chuyển hướng người dùng ra ngoài ngay sau
 * khi họ nhập mật khẩu.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw.startsWith("/login") ? "/" : raw;
}
