import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { IconPlay } from "../../shared/action-and-media-icons";
import { stripDayLabel, type ViewerItem } from "./media-viewer-items";

/**
 * Dải ảnh / video bên phải cửa sổ xem như Zalo PC: ô vuông nhỏ chia theo ngày ("04/10", "Hôm nay"),
 * ô đang xem có viền trắng và luôn được cuộn vào tầm nhìn. Kéo lên đầu dải thì tải phần cũ hơn, giữ
 * nguyên chỗ đang nhìn.
 */
export function MediaViewerStrip({
  items,
  currentId,
  timeZone,
  onPick,
  hasOlder,
  onLoadOlder,
}: {
  items: ViewerItem[];
  currentId: number;
  timeZone: string;
  onPick: (id: number) => void;
  hasOlder: boolean;
  onLoadOlder: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const firstId = items[0]?.id;
  const before = useRef<{ firstId: number | undefined; height: number }>({ firstId, height: 0 });

  // Phần cũ hơn chèn lên đầu: bù chiều cao để ô đang nhìn không bị đẩy xuống
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (before.current.firstId !== undefined && before.current.firstId !== firstId) el.scrollTop += el.scrollHeight - before.current.height;
    before.current = { firstId, height: el.scrollHeight };
  }, [firstId, items.length]);

  useEffect(() => {
    box.current?.querySelector(`[data-viewer-id="${currentId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId, items.length]);

  let lastDay = "";
  return (
    <div
      ref={box}
      onScroll={(e) => hasOlder && e.currentTarget.scrollTop < 80 && onLoadOlder()}
      className="flex h-full w-[104px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-l border-white/10 px-2 py-3 [scrollbar-width:thin]"
    >
      {items.map((it) => {
        const day = stripDayLabel(it.sentAt, timeZone);
        const heading = day !== lastDay ? day : null;
        lastDay = day;
        const active = it.id === currentId;
        return (
          <Fragment key={it.id}>
            {heading && <div className="w-full pt-1 text-center text-[12px] text-white/60">{heading}</div>}
            <button
              type="button"
              data-viewer-id={it.id}
              onClick={() => onPick(it.id)}
              aria-current={active ? "true" : undefined}
              className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-white/5 ${active ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
            >
              {it.kind === "video" ? (
                <>
                  <video src={`${it.url}#t=0.1`} preload="metadata" muted className="h-full w-full object-cover" />
                  <span className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
                    <IconPlay size={13} />
                  </span>
                </>
              ) : (
                <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
