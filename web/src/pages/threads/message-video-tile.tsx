import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { IconPlay } from "../../shared/action-and-media-icons";
import { formatVideoDuration } from "./media-viewer-items";

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
  const [durationMs, setDurationMs] = useState(video?.durationMs ?? null);
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
      <video
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => {
          const seconds = e.currentTarget.duration;
          if (durationMs === null && Number.isFinite(seconds)) setDurationMs(seconds * 1000);
          onMediaLoad?.();
        }}
        className="pointer-events-none h-full w-full object-cover"
      />
      {durationMs !== null && (
        <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white">
          {formatVideoDuration(durationMs)}
        </span>
      )}
      <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white">
        <IconPlay size={20} />
      </span>
    </button>
  );
}
