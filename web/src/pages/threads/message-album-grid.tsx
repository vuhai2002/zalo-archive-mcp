import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { canOpenInNewTab, MessageAttachmentView, sameOriginUrl } from "./message-attachment-view";
import { useMediaViewer } from "./media-viewer-context";
import { viewerItemFromMessage } from "./media-viewer-items";
import { VideoPosterFace } from "./video-poster-face";
import { albumScale, zaloAlbumLayout, type AlbumCell } from "./zalo-photo-album-layout";

/**
 * Album ảnh (nhiều ảnh gửi cùng lúc) như Zalo PC: ảnh xếp thành các hàng cùng chiều cao, rộng theo tỉ lệ ảnh
 * (`zaloAlbumLayout`), khe 2px, chỉ bo góc ngoài; khung thu nhỏ theo chỗ trống. Bấm ảnh mở cửa sổ xem ảnh của hội
 * thoại. Ảnh chưa tải được (đang chờ, hỏng, link hết hạn) hiện trạng thái + nút Thử lại ngay trong ô.
 */
export function MessageAlbumGrid({
  album,
  onMediaLoad,
  onMediaRetried,
}: {
  album: ArchivedMessage[];
  onMediaLoad: () => void;
  onMediaRetried: () => void;
}) {
  const layout = useMemo(() => zaloAlbumLayout(album.map((m) => ({ width: m.album?.width ?? null, height: m.album?.height ?? null }))), [album]);
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(layout.width);
  // Đo chỗ trống trước khi vẽ (useLayoutEffect) để khung không nhảy cỡ; cột tin hẹp lại thì đo lại
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const k = albumScale(available, layout.width);

  return (
    <div ref={box} className="max-w-full" style={{ width: layout.width }}>
      <div className="relative" style={{ width: layout.width * k, height: layout.height * k }}>
        {album.map((m, i) => {
          const cell = layout.cells[i];
          return cell ? <AlbumPhoto key={m.id} msg={m} cell={cell} k={k} onMediaLoad={onMediaLoad} onMediaRetried={onMediaRetried} /> : null;
        })}
      </div>
    </div>
  );
}

function AlbumPhoto({
  msg,
  cell,
  k,
  onMediaLoad,
  onMediaRetried,
}: {
  msg: ArchivedMessage;
  cell: AlbumCell;
  k: number;
  onMediaLoad: () => void;
  onMediaRetried: () => void;
}) {
  const viewer = useMediaViewer();
  const att = msg.attachments.find((a) => a.kind === "photo" || a.kind === "video") ?? msg.attachments[0];
  const url = att?.status === "done" ? sameOriginUrl(att.url) : null;
  const frame: CSSProperties = {
    left: cell.x * k,
    top: cell.y * k,
    width: cell.width * k,
    height: cell.height * k,
    borderRadius: cell.radius.map((r) => `${r}px`).join(" "),
  };
  const frameClass = `absolute overflow-hidden bg-black/[0.04] dark:bg-white/5 ${msg.recalledAt !== null ? "opacity-60" : ""}`;

  if (!att || !url) {
    return (
      <div style={frame} className={`${frameClass} flex items-center justify-center p-1`}>
        {att ? <MessageAttachmentView att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} compact /> : null}
      </div>
    );
  }
  // Video trong chùm như Zalo PC: khung hình đầu + thời lượng + nút phát; bấm mở cửa sổ xem và phát ở đó
  const isVideo = att.kind === "video";
  const img = isVideo ? (
    <VideoPosterFace url={url} durationMs={msg.video?.durationMs ?? null} onMediaLoad={onMediaLoad} compact />
  ) : (
    <img src={url} alt={att.fileName ?? "Ảnh"} loading="lazy" onLoad={onMediaLoad} className="block h-full w-full" style={{ objectFit: cell.fit }} />
  );
  const item = viewer ? viewerItemFromMessage(msg, att) : null;
  if (item) {
    return (
      <button
        type="button"
        onClick={() => viewer?.open(item)}
        title={isVideo ? "Xem video" : "Xem ảnh"}
        style={frame}
        className={`${frameClass} block ${isVideo ? "bg-black" : "cursor-zoom-in"}`}
      >
        {img}
      </button>
    );
  }
  return canOpenInNewTab(att.mime) ? (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ gốc trong tab mới" style={frame} className={`${frameClass} block cursor-zoom-in`}>
      {img}
    </a>
  ) : (
    <div style={frame} className={frameClass}>
      {img}
    </div>
  );
}
