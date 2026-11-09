import { useEffect } from "react";
import type { StorageFile } from "../../../archive-api-types";
import { useChotNen } from "../../../shared/backdrop-close-guard";
import { IconClose } from "../../../shared/dashboard-icons";
import { sameOriginUrl } from "../../../shared/same-origin-media-url";

/** Nút Mở trong lưới file: ảnh / video xem ngay trên nền tối; Esc hoặc bấm ra ngoài để đóng */
export function StorageFileViewer({ file, onClose }: { file: StorageFile; onClose: () => void }) {
  const nen = useChotNen(onClose);
  const url = sameOriginUrl(file.url);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/85 p-4" {...nen} role="dialog" aria-modal="true" aria-label="Xem file">
      <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <IconClose size={22} />
      </button>
      {url &&
        (file.kind === "video" ? (
          <video src={url} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={url} alt={file.fileName ?? ""} className="max-h-full max-w-full object-contain" />
        ))}
    </div>
  );
}
