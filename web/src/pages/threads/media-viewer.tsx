import { useCallback, useEffect, useState } from "react";
import { copyImageToClipboard } from "../../shared/copy-image-to-clipboard";
import { IconChevronDown, IconClose } from "../../shared/dashboard-icons";
import { MediaViewerBottomBar } from "./media-viewer-bottom-bar";
import type { ViewerItem } from "./media-viewer-items";
import { MAX_SCALE, MediaViewerStage, MIN_SCALE } from "./media-viewer-stage";
import { MediaViewerStrip } from "./media-viewer-strip";
import { useMediaViewerItems } from "./use-media-viewer-items";

const NAV_BTN = "flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-30";

/**
 * Cửa sổ xem ảnh / video như Zalo PC (bấm ảnh, video, ô trong album hay trong bảng thông tin): nền tối
 * phủ cả màn hình, tên hội thoại ở trên; giữa là ảnh / video; bên phải dải ảnh của cả hội thoại, nút lên
 * / xuống; dưới là người gửi, tải về, xoay, phóng to, menu. Phím: Esc đóng, mũi tên chuyển ảnh.
 */
export function MediaViewer({
  threadId,
  threadName,
  start,
  timeZone,
  onClose,
  onOpenMessage,
}: {
  threadId: string;
  threadName: string;
  start: ViewerItem;
  timeZone: string;
  onClose: () => void;
  /** "Xem tin nhắn gốc": đóng cửa sổ và nhảy tới tin */
  onOpenMessage: (messageId: number) => void;
}) {
  const { items, hasOlder, loadOlder } = useMediaViewerItems(threadId, start);
  const [currentId, setCurrentId] = useState(start.id);
  const index = items.findIndex((x) => x.id === currentId);
  const item = items[index] ?? start;
  const [showStrip, setShowStrip] = useState(true);
  const [scale, setScale] = useState(MIN_SCALE);
  const [rotate, setRotate] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setScale(MIN_SCALE);
    setRotate(0);
  }, [currentId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2_000);
    return () => clearTimeout(t);
  }, [notice]);

  const go = useCallback(
    (step: number) => {
      const next = items[index + step];
      if (next) setCurrentId(next.id);
      else if (step < 0 && hasOlder) loadOlder();
    },
    [items, index, hasOlder, loadOlder],
  );
  const zoom = (step: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + step * 0.5)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      // Đang bấm vào video: mũi tên để tua, không chuyển ảnh
      if ((e.target as HTMLElement | null)?.tagName === "VIDEO") return;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") (e.preventDefault(), go(-1));
      if (e.key === "ArrowDown" || e.key === "ArrowRight") (e.preventDefault(), go(1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Xem ảnh, video - ${threadName}`} className="fixed inset-0 z-[60] flex flex-col bg-[#1f1f1f] text-white">
      <div className="relative flex h-11 shrink-0 items-center justify-center px-12">
        <h2 className="truncate text-[15px] font-medium">{threadName}</h2>
        <button type="button" onClick={onClose} aria-label="Đóng" title="Đóng (Esc)" className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white">
          <IconClose size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <MediaViewerStage item={item} scale={scale} rotate={rotate} onZoom={(s) => item.kind !== "video" && zoom(s)} />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <button type="button" onClick={() => go(-1)} disabled={index <= 0 && !hasOlder} aria-label="Ảnh trước" title="Ảnh trước" className={NAV_BTN}>
              <IconChevronDown size={20} className="rotate-180" />
            </button>
            <button type="button" onClick={() => go(1)} disabled={index === -1 || index >= items.length - 1} aria-label="Ảnh sau" title="Ảnh sau" className={NAV_BTN}>
              <IconChevronDown size={20} />
            </button>
          </div>
          {notice && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px]" role="status">
              {notice}
            </div>
          )}
        </div>
        {showStrip && (
          <MediaViewerStrip items={items} currentId={item.id} timeZone={timeZone} onPick={setCurrentId} hasOlder={hasOlder} onLoadOlder={loadOlder} />
        )}
      </div>

      <MediaViewerBottomBar
        item={item}
        timeZone={timeZone}
        canZoomIn={scale < MAX_SCALE}
        canZoomOut={scale > MIN_SCALE}
        onRotate={() => setRotate((r) => (r + 90) % 360)}
        onZoom={zoom}
        onToggleStrip={() => setShowStrip((v) => !v)}
        onCopy={() => copyImageToClipboard(item.url).then(() => setNotice("Đã copy ảnh"), () => setNotice("Trình duyệt không cho copy ảnh"))}
        onOpenMessage={() => onOpenMessage(item.messageId)}
      />
    </div>
  );
}
