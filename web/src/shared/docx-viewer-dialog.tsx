import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconDownload } from "./action-and-media-icons";
import { IconClose } from "./dashboard-icons";
import { DocxDocumentFrame } from "./docx-document-frame";
import { FileTypeBadge } from "./file-type-badge";
import { formatFileSize } from "./format-file-size";
import { downloadUrlOf } from "./same-origin-media-url";

/**
 * Cửa sổ đọc file Word (.docx) ngay trong kho: thanh trên có tên file, cỡ, nút Lưu về máy và Đóng; giữa là các trang của
 * file (`DocxDocumentFrame`). Esc (kể cả khi đang bấm trong file) đóng cửa sổ.
 */
export function DocxViewerDialog({
  url,
  fileName,
  sizeBytes,
  onClose,
}: {
  url: string;
  fileName: string | null;
  sizeBytes: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = fileName ?? "File Word";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Xem file ${name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-[#1f1f1f] text-white"
      {...STOP_BUBBLE}
    >
      <header className="flex items-center gap-3 px-4 py-2.5">
        <FileTypeBadge name={fileName ?? "file.docx"} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{name}</p>
          <p className="text-[12.5px] text-white/70">{formatFileSize(sizeBytes)}</p>
        </div>
        <a
          href={downloadUrlOf(url)}
          download={fileName ?? true}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] font-medium hover:bg-white/15"
        >
          <IconDownload size={16} />
          Lưu về máy
        </a>
        <button type="button" onClick={onClose} aria-label="Đóng" title="Đóng (Esc)" className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20">
          <IconClose size={20} />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <DocxDocumentFrame url={url} onEscape={onClose} />
      </div>
    </div>,
    document.body,
  );
}

// Cửa sổ mở từ trong thẻ tin (portal ra body), nhưng sự kiện React vẫn nổi lên các thành phần cha của thẻ (chọn tin, menu
// tin...): chặn chuột ở gốc cửa sổ để bấm trong cửa sổ không đụng tới khung chat phía sau. Phím không chặn: Esc cần tới
// window để đóng cửa sổ.
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const STOP_BUBBLE = { onClick: stop, onPointerDown: stop, onMouseDown: stop, onContextMenu: stop };
