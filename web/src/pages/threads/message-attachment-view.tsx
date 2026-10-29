import type { AttachmentInfo } from "../../archive-api-types";
import { IconDownload, IconFileText, IconImage } from "../../shared/action-and-media-icons";
import { mediaStatusLabel } from "../../shared/archive-status-labels";
import { formatFileSize } from "../../shared/format-file-size";

const KIND_LABEL: Record<AttachmentInfo["kind"], string> = {
  photo: "Ảnh",
  gif: "Ảnh GIF",
  video: "Video",
  voice: "Tin nhắn thoại",
  file: "File",
};

/**
 * Chỉ dùng URL cùng origin với dashboard. Server tự dựng `url` nên bình thường
 * luôn đúng; chặn ở đây để một giá trị lạ (vd `javascript:`) không bao giờ lọt
 * vào `href`/`src`.
 */
function sameOriginUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/**
 * Ảnh SVG mở ở tab mới là chạy được script trên origin của dashboard - file do
 * người lạ gửi thì đó là đường XSS. Chỉ cho bấm mở tab mới với ảnh raster.
 */
function canOpenInNewTab(mime: string | null): boolean {
  return !mime || !mime.toLowerCase().includes("svg");
}

export function MessageAttachmentView({ att, onMediaLoad }: { att: AttachmentInfo; onMediaLoad?: () => void }) {
  const url = att.status === "done" ? sameOriginUrl(att.url) : null;
  const name = att.fileName ?? KIND_LABEL[att.kind];

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-tile/50 px-3 py-2 text-[13px] text-ink-soft">
        {att.kind === "photo" || att.kind === "gif" ? <IconImage size={16} /> : <IconFileText size={16} />}
        <span className="min-w-0 truncate">{name}</span>
        <span className="shrink-0 text-[12px]">· {mediaStatusLabel(att.status)}</span>
      </div>
    );
  }

  if (att.kind === "photo" || att.kind === "gif") {
    const img = (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onLoad={onMediaLoad}
        className="max-h-72 max-w-full rounded-lg border border-line bg-tile object-contain"
      />
    );
    return canOpenInNewTab(att.mime) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ gốc trong tab mới" className="block cursor-zoom-in">
        {img}
      </a>
    ) : (
      img
    );
  }

  if (att.kind === "video") {
    return (
      <video controls preload="metadata" src={url} onLoadedMetadata={onMediaLoad} className="max-h-80 max-w-full rounded-lg bg-black" />
    );
  }

  if (att.kind === "voice") {
    return <audio controls preload="none" src={url} className="w-64 max-w-full" />;
  }

  return (
    <a
      href={url}
      download={att.fileName ?? true}
      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-ink hover:bg-tile"
      title="Tải file về máy"
    >
      <IconFileText size={20} className="shrink-0 text-zalo-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block text-[11px] text-ink-soft">{formatFileSize(att.sizeBytes)}</span>
      </span>
      <IconDownload size={16} className="shrink-0 text-ink-soft" />
    </a>
  );
}
