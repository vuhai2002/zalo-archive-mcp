import { zaloJxlVariantUrl } from "./zalo-jxl-photo.js";

/** Bản chép gif Tenor của Zalo (gif chọn trong ô gif của Zalo) */
const ZALO_TENOR_MIRROR_HOST = "media-ten.z-cdn.me";
const TENOR_MEDIA_HOST = "media.tenor.com";

/**
 * Nơi khác còn giữ bản gốc khi link trên CDN Zalo hỏng:
 * - ảnh: bản JXL gốc trên chính CDN ảnh Zalo (khâu đổi ra JPG hỏng) - xem `zalo-jxl-photo.ts`;
 * - gif: Zalo chép gif Tenor sang `media-ten.z-cdn.me` giữ nguyên đường dẫn, rồi xóa bản chép (404 với cả gif
 *   cũ khi đồng bộ toàn bộ lịch sử) - bản gốc cùng đường dẫn trên `media.tenor.com` vẫn còn.
 * `label` đi vào lỗi khi bản dự phòng cũng hỏng ("bản JXL: HTTP 404"); bước tải lại ảnh JXL lúc khởi động
 * dựa vào chữ "JXL" đó để không xếp lại ảnh đã thử.
 */
export function fallbackSourceUrl(kind: string, url: string): { url: string; label: string } | null {
  if (kind === "photo") {
    const jxl = zaloJxlVariantUrl(url);
    return jxl ? { url: jxl, label: "JXL" } : null;
  }
  if (kind === "gif") {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.hostname.toLowerCase() !== ZALO_TENOR_MIRROR_HOST) return null;
    u.protocol = "https:";
    u.hostname = TENOR_MEDIA_HOST;
    return { url: u.toString(), label: "Tenor" };
  }
  return null;
}
