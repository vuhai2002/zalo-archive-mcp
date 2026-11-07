/**
 * Nhiều ảnh gửi cùng lúc trên Zalo là nhiều tin `chat.photo` riêng, mỗi tin một ảnh, cùng mang trong
 * `content.params` (chuỗi JSON): `is_group_layout = 1`, `group_layout_id` (mã album, giống nhau),
 * `id_in_group` (vị trí trong album, tính từ 0) và `total_item_in_group`. Các tin tới lệch thứ tự và
 * cách nhau vài giây; app Zalo gộp chúng thành một khung lưới theo mã album. `width` / `height` (cỡ ảnh gốc, cũng
 * trong params) để xếp lưới theo tỉ lệ ảnh như Zalo; null khi tin không ghi.
 */
export type PhotoAlbum = { id: string; index: number; total: number; width: number | null; height: number | null };

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function photoAlbumOf(paramsJson: unknown): PhotoAlbum | null {
  if (typeof paramsJson !== "string") return null;
  let p: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(paramsJson);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    p = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const id = p.group_layout_id;
  if (Number(p.is_group_layout) !== 1 || (typeof id !== "number" && typeof id !== "string") || String(id) === "") return null;
  const index = Number(p.id_in_group);
  const total = Number(p.total_item_in_group);
  return {
    id: String(id),
    index: Number.isFinite(index) ? index : 0,
    total: Number.isFinite(total) ? total : 0,
    width: positive(p.width),
    height: positive(p.height),
  };
}
