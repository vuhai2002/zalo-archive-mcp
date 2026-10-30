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
