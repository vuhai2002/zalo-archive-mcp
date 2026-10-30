import { useEffect, useRef, useState } from "react";
import type { ViewerItem } from "./media-viewer-items";

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

/**
 * Vùng giữa cửa sổ xem: video tự phát với thanh điều khiển, hoặc ảnh vừa khung - phóng to (nút hoặc
 * lăn chuột) rồi kéo để xem từng phần, xoay 90 độ mỗi lần bấm. Đổi ảnh thì về lại cỡ vừa khung.
 */
export function MediaViewerStage({
  item,
  scale,
  rotate,
  onZoom,
}: {
  item: ViewerItem;
  scale: number;
  rotate: number;
  /** Lăn chuột: + phóng to, - thu nhỏ */
  onZoom: (step: number) => void;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  useEffect(() => setPan({ x: 0, y: 0 }), [item.id, scale === MIN_SCALE]);

  if (item.kind === "video") {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <video key={item.id} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded bg-black" />
      </div>
    );
  }

  const zoomed = scale > MIN_SCALE;
  return (
    <div
      className={`flex h-full w-full select-none items-center justify-center overflow-hidden p-4 ${zoomed ? "cursor-grab active:cursor-grabbing" : ""}`}
      onWheel={(e) => onZoom(e.deltaY < 0 ? 1 : -1)}
      onMouseDown={(e) => {
        if (!zoomed) return;
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }}
      onMouseMove={(e) => {
        const d = drag.current;
        if (d) setPan({ x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y });
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
    >
      <img
        key={item.id}
        src={item.url}
        alt=""
        draggable={false}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotate}deg)` }}
        className={`max-h-full max-w-full object-contain ${drag.current ? "" : "transition-transform duration-150"}`}
      />
    </div>
  );
}
