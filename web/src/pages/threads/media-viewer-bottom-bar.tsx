import { useEffect, useRef, useState } from "react";
import { IconDownload } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { iconBase, IconPanelRight, type IconProps } from "../../shared/dashboard-icons";
import { viewerTimeLabel, type ViewerItem } from "./media-viewer-items";

const IconRotate = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </svg>
);
const IconZoom = ({ minus = false, ...p }: IconProps & { minus?: boolean }) => (
  <svg {...iconBase(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d={minus ? "M7.5 10.5h6M15.5 15.5 20 20" : "M7.5 10.5h6M10.5 7.5v6M15.5 15.5 20 20"} />
  </svg>
);
const IconMore = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={3} />
  </svg>
);

const BTN = "flex h-9 w-9 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-35";
const Divider = () => <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />;

/**
 * Thanh dưới cửa sổ xem như Zalo PC: người gửi + giờ; giữa là tải về, xoay, phóng to / thu nhỏ (ảnh);
 * phải là cảm xúc, ẩn / hiện dải ảnh và menu "..." (Copy ảnh, Xem tin nhắn gốc, Lưu về máy). Kho chỉ
 * lưu nên không có Chia sẻ hay Xóa.
 */
export function MediaViewerBottomBar({
  item,
  timeZone,
  canZoomIn,
  canZoomOut,
  onRotate,
  onZoom,
  onToggleStrip,
  onCopy,
  onOpenMessage,
}: {
  item: ViewerItem;
  timeZone: string;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onRotate: () => void;
  onZoom: (step: number) => void;
  onToggleStrip: () => void;
  onCopy: () => void;
  onOpenMessage: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => !menuBox.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [menu]);

  const image = item.kind !== "video";
  const name = item.isSelf ? item.senderName?.trim() || "Bạn" : item.senderName?.trim() || item.senderId;
  const reactionCount = item.reactions.reduce((n, r) => n + r.count, 0);
  const MENU_ITEM = "block w-full px-4 py-2 text-left text-[14px] text-ink hover:bg-tile";

  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-t border-white/10 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <ContactAvatar name={name} seed={item.senderId} url={item.senderAvatarUrl} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-white">{name}</div>
          <div className="text-[12px] text-white/60">{viewerTimeLabel(item.sentAt, timeZone)}</div>
        </div>
      </div>

      <div className="flex items-center">
        <a href={item.url} download className={BTN} title="Lưu về máy" aria-label="Lưu về máy">
          <IconDownload size={19} />
        </a>
        {image && (
          <>
            <Divider />
            <button type="button" onClick={onRotate} className={BTN} title="Xoay ảnh" aria-label="Xoay ảnh">
              <IconRotate size={18} />
            </button>
            <Divider />
            <button type="button" onClick={() => onZoom(1)} disabled={!canZoomIn} className={BTN} title="Phóng to" aria-label="Phóng to">
              <IconZoom size={19} />
            </button>
            <button type="button" onClick={() => onZoom(-1)} disabled={!canZoomOut} className={BTN} title="Thu nhỏ" aria-label="Thu nhỏ">
              <IconZoom size={19} minus />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        {reactionCount > 0 && (
          <span className="mr-2 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[13px] text-ink" title={item.reactions.flatMap((r) => r.names).join(", ")}>
            {item.reactions.slice(0, 3).map((r) => (
              <span key={r.icon}>{r.emoji ?? r.icon}</span>
            ))}
            <span className="tabular-nums">{reactionCount}</span>
          </span>
        )}
        <button type="button" onClick={onToggleStrip} className={BTN} title="Ẩn / hiện danh sách ảnh" aria-label="Ẩn hoặc hiện danh sách ảnh">
          <IconPanelRight size={18} />
        </button>
        <div ref={menuBox} className="relative">
          <button type="button" onClick={() => setMenu((v) => !v)} className={BTN} title="Thêm" aria-label="Thêm" aria-expanded={menu}>
            <IconMore size={20} />
          </button>
          {menu && (
            <div className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-lg bg-surface py-1 shadow-xl">
              {image && (
                <button type="button" onClick={() => (setMenu(false), onCopy())} className={MENU_ITEM}>
                  Copy
                </button>
              )}
              <button type="button" onClick={() => (setMenu(false), onOpenMessage())} className={MENU_ITEM}>
                Xem tin nhắn gốc
              </button>
              <a href={item.url} download onClick={() => setMenu(false)} className={MENU_ITEM}>
                Lưu về máy
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
