/**
 * Thẻ link của Zalo (`chat.recommended`, action `recommened.link`): app vẽ URL xanh, tiêu đề, mô tả
 * và tên miền. Khi người gửi chỉ dán URL, Zalo đặt cùng URL vào cả tiêu đề lẫn mô tả - phần trùng
 * URL bị bỏ để thẻ không lặp. Chỉ nhận link http(s): giá trị lạ không bao giờ thành `href`.
 */
export type LinkPreview = { url: string; title: string | null; description: string | null; domain: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function httpUrl(v: string | null): URL | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function linkPreviewOf(content: unknown): LinkPreview | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const c = content as Record<string, unknown>;
  if (c.action !== "recommened.link") return null;
  const title = text(c.title);
  const u = httpUrl(text(c.href)) ?? httpUrl(title);
  if (!u) return null;
  const url = u.toString();
  const same = (s: string | null) => !s || s === url || s === text(c.href);
  const description = text(c.description);
  return {
    url,
    title: same(title) ? null : title,
    description: same(description) || description === title ? null : description,
    domain: u.hostname,
  };
}
