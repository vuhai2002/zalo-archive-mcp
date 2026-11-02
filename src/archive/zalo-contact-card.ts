/**
 * Danh thiếp Zalo (`chat.recommended`, action `recommened.user`): `params` là mã người được giới thiệu,
 * `title` tên, `thumb` avatar, `description` là JSON (số điện thoại nếu người gửi kèm, ảnh mã QR).
 * Ảnh chỉ nhận https trên CDN Zalo: dữ liệu lạ không bao giờ thành link ảnh tới nơi khác.
 */
export type ContactCard = { userId: string; name: string; avatarUrl: string | null; phone: string | null; qrUrl: string | null };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function zaloImage(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    const zalo = ["zdn.vn", "zadn.vn"].some((d) => host === d || host.endsWith(`.${d}`));
    return u.protocol === "https:" && zalo ? u.toString() : null;
  } catch {
    return null;
  }
}

function descriptionJson(v: unknown): Record<string, unknown> {
  if (typeof v !== "string") return {};
  try {
    const j = JSON.parse(v) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function contactCardOf(content: unknown): ContactCard | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const c = content as Record<string, unknown>;
  if (c.action !== "recommened.user") return null;
  const userId = text(c.params);
  const name = text(c.title);
  if (!userId || !/^\d+$/.test(userId) || !name) return null;
  const d = descriptionJson(c.description);
  const phone = text(d.phone);
  return {
    userId,
    name,
    avatarUrl: zaloImage(c.thumb),
    phone: phone && /^[+\d][\d .-]{5,}$/.test(phone) ? phone : null,
    qrUrl: zaloImage(d.qrCodeUrl),
  };
}
