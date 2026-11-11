import type { ArchivedMessage } from "../../archive-api-types";
import { VideoPosterFace } from "./video-poster-face";

/** Khung tối đa của ô video trong khung chat (px); video dọc thì chạm chiều cao, ngang thì chạm chiều rộng */
const MAX_W = 300;
const MAX_H = 340;
const MIN_W = 120;

/**
 * Video trong khung chat như Zalo PC: không khung bong bóng, ảnh khung hình đầu đúng tỉ lệ, góc trên
 * trái ghi thời lượng ("00:33"), giữa là nút phát. Bấm là mở cửa sổ xem (video phát ở đó), không phát
 * ngay trong khung chat. Kích thước lấy từ thông số Zalo gửi kèm nên ô không nhảy khi video tải xong.
 */
export function MessageVideoTile({
  url,
  video,
  onOpen,
  onMediaLoad,
}: {
  url: string;
  video: ArchivedMessage["video"];
  onOpen: () => void;
  onMediaLoad?: () => void;
}) {
  const ratio = video?.width && video?.height ? video.width / video.height : 16 / 9;
  const width = Math.max(MIN_W, ratio < 1 ? MAX_H * ratio : MAX_W);

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Xem video"
      style={{ width, aspectRatio: String(ratio), maxWidth: "100%" }}
      className="relative block overflow-hidden rounded-lg bg-black"
    >
      <VideoPosterFace url={url} durationMs={video?.durationMs ?? null} onMediaLoad={onMediaLoad} />
    </button>
  );
}
