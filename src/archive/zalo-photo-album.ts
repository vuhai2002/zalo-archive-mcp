/**
 * Nhiều ảnh gửi cùng lúc trên Zalo là nhiều tin `chat.photo` riêng, mỗi tin một ảnh, cùng mang trong
 * `content.params` (chuỗi JSON): `is_group_layout = 1`, `group_layout_id` (mã album, giống nhau),
 * `id_in_group` (vị trí trong album, tính từ 0) và `total_item_in_group`. Các tin tới lệch thứ tự và
 * cách nhau vài giây; app Zalo gộp chúng thành một khung lưới theo mã album. Gửi cả ảnh lẫn video thì tin
 * `chat.video.msg` cũng mang cùng mã album (một chùm có thể vừa ảnh vừa video). `width` / `height` (cỡ ảnh gốc, hay
 * `video_width` / `video_height` của video, xoay 90 / 270 độ thì đổi chiều) để xếp lưới theo tỉ lệ như Zalo; null khi
 * tin không ghi.
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
  const rotated = Number(p.video_rotation) === 90 || Number(p.video_rotation) === 270;
  const w = positive(p.width ?? p.video_width);
  const h = positive(p.height ?? p.video_height);
  return {
    id: String(id),
    index: Number.isFinite(index) ? index : 0,
    total: Number.isFinite(total) ? total : 0,
    width: rotated ? h : w,
    height: rotated ? w : h,
  };
}
