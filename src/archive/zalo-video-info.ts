/**
 * Thông số video Zalo gửi kèm tin `chat.video.msg` (`content.params`, chuỗi JSON hoặc object): thời
 * lượng (ms), chiều rộng / cao. Dashboard dùng để vẽ ô video đúng tỉ lệ ngay từ đầu và hiện "00:33" như
 * Zalo, không phải chờ tải file. Thiếu / hỏng trường nào thì để null.
 */
export type VideoInfo = { durationMs: number | null; width: number | null; height: number | null };

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function videoInfoOf(raw: unknown): VideoInfo | null {
  let p: unknown = raw;
  if (typeof raw === "string") {
    try {
      p = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  // Video xoay 90 / 270 độ: đổi chiều rộng - cao để ô hiện đúng chiều đứng
  const rotated = Number(o.video_rotation) === 90 || Number(o.video_rotation) === 270;
  const w = positive(o.video_width);
  const h = positive(o.video_height);
  const info = { durationMs: positive(o.duration), width: rotated ? h : w, height: rotated ? w : h };
  return info.durationMs === null && info.width === null && info.height === null ? null : info;
}
