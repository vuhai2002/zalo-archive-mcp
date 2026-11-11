/**
 * Chỉ dùng URL cùng origin với dashboard. Server tự dựng `url` nên bình thường
 * luôn đúng; chặn ở đây để một giá trị lạ (vd `javascript:`) không bao giờ lọt
 * vào `href`/`src`. Module thuần.
 */
export function sameOriginUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/**
 * Ảnh SVG mở ở tab mới là chạy được script trên origin của dashboard - file do
 * người lạ gửi thì đó là đường XSS. Chỉ cho bấm mở tab mới với ảnh raster.
 */
export function canOpenInNewTab(mime: string | null): boolean {
  return !mime || !mime.toLowerCase().includes("svg");
}

/** Link "Lưu về máy": thêm download=1 để trình duyệt tải về với tên gốc thay vì mở */
export const downloadUrlOf = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

/**
 * File trình duyệt tự xem / phát được trong tab (theo kiểu file kho trả, đã đoán theo đuôi khi Zalo không gửi kèm): PDF,
 * ảnh thường, văn bản thuần, nhạc, video. Bấm là mở tab mới bằng trình xem sẵn có của trình duyệt thay vì tải về.
 * SVG không mở (chạy được script trên origin của dashboard).
 */
export function opensInBrowser(mime: string | null): boolean {
  const m = mime?.toLowerCase() ?? "";
  if (!m || m.includes("svg")) return false;
  return m === "application/pdf" || m.startsWith("image/") || m.startsWith("text/plain") || m.startsWith("audio/") || m.startsWith("video/");
}
