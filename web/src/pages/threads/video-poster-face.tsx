import { useState } from "react";
import { IconPlay } from "../../shared/action-and-media-icons";
import { formatVideoDuration } from "./media-viewer-items";

/**
 * Mặt ô video như Zalo PC: khung hình đầu (trình duyệt chỉ tải phần đầu file để lấy khung), thời lượng ("00:33") góc trên
 * trái, nút phát giữa ô. Dùng cho video lẻ và ô video trong chùm ảnh / video. Thời lượng Zalo không gửi thì lấy từ file khi
 * tải xong phần đầu. `compact`: ô nhỏ trong chùm (chữ, nút nhỏ hơn). Cha phải `relative` và giữ kích thước ô.
 */
export function VideoPosterFace({
  url,
  durationMs,
  onMediaLoad,
  compact = false,
}: {
  url: string;
  durationMs: number | null;
  onMediaLoad?: () => void;
  compact?: boolean;
}) {
  const [ms, setMs] = useState(durationMs);
  return (
    <>
      <video
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => {
          const seconds = e.currentTarget.duration;
          if (ms === null && Number.isFinite(seconds)) setMs(seconds * 1000);
          onMediaLoad?.();
        }}
        className="pointer-events-none h-full w-full object-cover"
      />
      {ms !== null && (
        <span
          className={`absolute rounded bg-black/55 font-semibold tabular-nums text-white ${compact ? "left-1.5 top-1.5 px-1 text-[11px]" : "left-2 top-2 px-1.5 py-0.5 text-[12px]"}`}
        >
          {formatVideoDuration(ms)}
        </span>
      )}
      <span className={`absolute inset-0 m-auto flex items-center justify-center rounded-full bg-black/45 text-white ${compact ? "h-8 w-8" : "h-11 w-11"}`}>
        <IconPlay size={compact ? 15 : 20} />
      </span>
    </>
  );
}
