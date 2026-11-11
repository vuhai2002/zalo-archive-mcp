import type { AttachmentInfo } from "../../archive-api-types";
import { IconDownload, IconFileText } from "../../shared/action-and-media-icons";
import { formatFileSize } from "../../shared/format-file-size";
import { downloadUrlOf, opensInBrowser } from "../../shared/same-origin-media-url";

const CARD = "flex items-center gap-2.5 rounded-md border border-black/10 bg-surface/80 text-chat-ink hover:bg-surface dark:border-white/10";

/**
 * Thẻ file đã tải trong khung chat. File trình duyệt xem được (PDF, ảnh, văn bản; nhạc / video khi không có trình phát
 * phía trên): bấm thẻ là mở tab mới bằng trình xem của trình duyệt, nút tải nhỏ bên phải để lưu về máy. Loại trình duyệt
 * không xem được (Word, Excel, nén...): bấm là tải về như trước.
 */
export function MessageFileCard({ att, url, name, hasPlayer }: { att: AttachmentInfo; url: string; name: string; hasPlayer: boolean }) {
  const label = (
    <>
      <IconFileText size={20} className="shrink-0 text-zalo-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block text-[11px] text-ink-soft">{formatFileSize(att.sizeBytes)}</span>
      </span>
    </>
  );

  if (!hasPlayer && opensInBrowser(att.mime)) {
    return (
      <div className={`${CARD} pr-1.5`}>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Mở trong tab mới" className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3">
          {label}
        </a>
        <a
          href={downloadUrlOf(url)}
          download={att.fileName ?? true}
          title="Tải file về máy"
          aria-label="Tải file về máy"
          className="shrink-0 rounded p-1.5 text-ink-soft hover:bg-tile hover:text-zalo-500"
        >
          <IconDownload size={16} />
        </a>
      </div>
    );
  }
  return (
    <a href={downloadUrlOf(url)} download={att.fileName ?? true} className={`${CARD} px-3 py-2`} title="Tải file về máy">
      {label}
      <IconDownload size={16} className="shrink-0 text-ink-soft" />
    </a>
  );
}
