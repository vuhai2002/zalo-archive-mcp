import type { TextStyleSpan } from "../storage/message-text-styles.js";

/**
 * Tin link của Zalo (`chat.recommended`, action `recommened.link`), trình bày như Zalo:
 * - `title` là CHỮ CỦA TIN - toàn bộ chữ người gửi gõ (có thể nhiều dòng, chứa link), hoặc chính URL khi chỉ dán
 *   link; rỗng / "undefined" thì lấy URL. Trước đây kho coi nó là tiêu đề trang, in đậm và cắt 3 dòng.
 * - Thẻ xem trước bên dưới: tên trang `params.mediaTitle`, mô tả `description`, ảnh `thumb` (cỡ `params.tWidth` x
 *   `tHeight`), tên miền `params.src`. Khi chỉ dán URL, Zalo đặt cùng URL vào mô tả - phần trùng bị bỏ.
 * Chỉ nhận link http(s): giá trị lạ không bao giờ thành `href`. Ảnh chỉ nhận https trên CDN Zalo.
 */
export type LinkPreview = {
  url: string;
  /** Chữ của tin (đầy đủ) */
  text: string;
  /** Định dạng trên `text` (chỗ nhắc tên - dựng lúc đọc, cần danh bạ); rỗng khi dựng từ dữ liệu tin */
  textStyles: TextStyleSpan[];
  /** Tên trang trong thẻ xem trước */
  title: string | null;
  description: string | null;
  domain: string;
  thumbUrl: string | null;
  /** Rộng / cao của ảnh xem trước - giữ chỗ đúng tỉ lệ trước khi ảnh tải xong */
  thumbAspect: number | null;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() && v.trim() !== "undefined" ? v.trim() : null);

function httpUrl(v: string | null): URL | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function zaloImage(v: unknown): string | null {
  const u = httpUrl(text(v));
  if (!u || u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  return ["zdn.vn", "zadn.vn"].some((d) => host === d || host.endsWith(`.${d}`)) ? u.toString() : null;
}

function paramsOf(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function linkPreviewOf(content: unknown): LinkPreview | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const c = content as Record<string, unknown>;
  if (c.action !== "recommened.link") return null;
  const typed = text(c.title);
  const u = httpUrl(text(c.href)) ?? httpUrl(typed);
  if (!u) return null;
  const url = u.toString();
  const p = paramsOf(c.params);
  const same = (s: string | null) => !s || s === url || s === text(c.href) || s === typed;
  const title = text(p.mediaTitle);
  const description = text(c.description);
  const thumbUrl = zaloImage(c.thumb);
  const w = Number(p.tWidth);
  const h = Number(p.tHeight);
  return {
    url,
    text: typed ?? url,
    textStyles: [],
    title: same(title) ? null : title,
    description: same(description) || description === title ? null : description,
    domain: text(p.src) ?? u.hostname,
    thumbUrl,
    thumbAspect: thumbUrl && w > 0 && h > 0 ? w / h : null,
  };
}
