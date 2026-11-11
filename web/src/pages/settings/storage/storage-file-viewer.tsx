import { useEffect } from "react";
import type { StorageFile } from "../../../archive-api-types";
import { useArchiveTimeZone } from "../../../layout/dashboard-shell-context";
import { useChotNen } from "../../../shared/backdrop-close-guard";
import { IconCheck, IconChevronDown, IconClose } from "../../../shared/dashboard-icons";
import { formatDateTime } from "../../../shared/format-archive-time";
import { formatFileSize } from "../../../shared/format-file-size";
import { sameOriginUrl } from "../../../shared/same-origin-media-url";
import { threadDisplayName } from "../../../shared/thread-kind-badge";
import { downloadUrlOf, previewKind } from "./storage-display-rules";
import { StorageFilePreviewStage } from "./storage-file-preview-stage";

const BAR_BTN = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] font-medium hover:bg-white/15";
const NAV_BTN = "absolute top-1/2 z-[1] -translate-y-1/2 rounded-full bg-white/10 p-2.5 hover:bg-white/25 disabled:opacity-25 disabled:hover:bg-white/10";

/**
 * Xem nhanh một file trong lưới Quản lý dữ liệu (bấm vào ô), như cửa sổ xem ảnh của Zalo PC: nền tối, tên file + hội thoại +
 * ngày gửi, mũi tên (hoặc phím trái / phải) sang file trước / sau, gần cuối thì tải thêm. Thanh dưới: chọn / bỏ chọn để
 * xóa, Xem tin gốc, Lưu về máy, Mở trong tab mới (file trình duyệt không xem trước được). Esc hoặc bấm nền tối để đóng.
 */
export function StorageFileViewer(props: {
  files: StorageFile[];
  index: number;
  total: number;
  hasMore: boolean;
  isSelected: (f: StorageFile) => boolean;
  onIndex: (i: number) => void;
  onLoadMore: () => void;
  onToggle: (f: StorageFile) => void;
  onOpenOriginal: (f: StorageFile) => void;
  onClose: () => void;
}) {
  const { files, index, hasMore, onIndex, onLoadMore, onClose } = props;
  const tz = useArchiveTimeZone();
  const nen = useChotNen(onClose);
  const file = files[index];
  const canPrev = index > 0;
  const canNext = index < files.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      // Đang bấm trên trình phát thì phím trái / phải là tua, không phải đổi file
      if (e.target instanceof HTMLMediaElement) return;
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, index, onClose, onIndex]);

  // Còn vài file nữa là hết phần đã tải: tải thêm để mũi tên phải đi tiếp được
  useEffect(() => {
    if (hasMore && index >= files.length - 3) onLoadMore();
  }, [files.length, hasMore, index, onLoadMore]);

  if (!file) return null;
  const url = sameOriginUrl(file.url) ?? file.url;
  const selected = props.isSelected(file);
  const sub = [threadDisplayName(file.threadName), formatFileSize(file.sizeBytes), formatDateTime(file.sentAt, tz)].join(" · ");

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-[#0b0b0d]/[0.97] text-white" role="dialog" aria-modal="true" aria-label="Xem file">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{file.fileName ?? (file.kind === "voice" ? "Tin nhắn thoại" : file.kind === "video" ? "Video" : "Ảnh")}</p>
          <p className="truncate text-[12.5px] text-white/70">{sub}</p>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-white/70">
          {index + 1} / {props.total}
        </span>
        <button type="button" onClick={onClose} aria-label="Đóng" className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20">
          <IconClose size={20} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-2" {...nen}>
        <StorageFilePreviewStage key={file.id} file={file} onEscape={onClose} />
        <button type="button" onClick={() => onIndex(index - 1)} disabled={!canPrev} aria-label="File trước" className={`${NAV_BTN} left-3`}>
          <IconChevronDown size={24} className="rotate-90" />
        </button>
        <button type="button" onClick={() => onIndex(index + 1)} disabled={!canNext} aria-label="File sau" className={`${NAV_BTN} right-3`}>
          <IconChevronDown size={24} className="-rotate-90" />
        </button>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-1 px-4 py-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          onClick={() => props.onToggle(file)}
          className={`${BAR_BTN} ${selected ? "bg-zalo-500 hover:bg-zalo-600" : ""}`}
        >
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? "border-white" : "border-white/70"}`}>
            {selected && <IconCheck size={12} strokeWidth={3} />}
          </span>
          {selected ? "Đã chọn để xóa" : "Chọn để xóa"}
        </button>
        <button type="button" onClick={() => props.onOpenOriginal(file)} className={BAR_BTN}>
          Xem tin gốc
        </button>
        <a href={downloadUrlOf(url)} download={file.fileName ?? true} className={BAR_BTN}>
          Lưu về máy
        </a>
        {previewKind(file) === "file" && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={BAR_BTN}>
            Mở trong tab mới
          </a>
        )}
      </footer>
    </div>
  );
}
