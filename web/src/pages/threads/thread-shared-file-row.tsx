import { useState } from "react";
import type { SharedAttachment } from "../../archive-api-types";
import { IconDownload } from "../../shared/action-and-media-icons";
import { unavailableFileLabel } from "../../shared/archive-status-labels";
import { isDocxFile } from "../../shared/docx-file-rules";
import { DocxViewerDialog } from "../../shared/docx-viewer-dialog";
import { formatDateTime } from "../../shared/format-archive-time";
import { FileTypeBadge } from "../../shared/file-type-badge";
import { formatFileSize } from "../../shared/format-file-size";
import { RevealInFolderButton } from "../../shared/reveal-in-folder-button";
import { downloadUrlOf, opensInBrowser, sameOriginUrl } from "../../shared/same-origin-media-url";

const ROW = "flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1.5 hover:bg-tile";

/**
 * Một file trong mục File của bảng thông tin hội thoại: PDF / ảnh / nhạc / video bấm là mở tab mới bằng trình xem của trình
 * duyệt, file Word (.docx) mở cửa sổ đọc ngay trong kho, loại khác tải về; file không xem được (Zalo đã xóa: "Đã hết hạn")
 * báo ngay và làm mờ. File đã tải có nút thư mục: mở Explorer chọn sẵn file (tên thật) trên máy.
 */
export function SharedFileRow({ a, timeZone }: { a: SharedAttachment; timeZone: string }) {
  const [docxOpen, setDocxOpen] = useState(false);
  const url = a.status === "done" ? sameOriginUrl(a.url) : null;
  const docx = !!url && isDocxFile(a.fileName, a.mime);
  const open = !!url && opensInBrowser(a.mime);
  const inner = (
    <>
      <span className={url ? "" : "opacity-40"}>
        <FileTypeBadge name={a.fileName} size={40} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] font-medium ${url ? "text-ink" : "text-ink-soft"}`}>{a.fileName ?? "File"}</span>
        <span className="flex justify-between gap-2 text-[12px] text-ink-soft">
          {url ? <span>{formatFileSize(a.sizeBytes)}</span> : <span className="font-medium text-red-500 dark:text-red-400">{unavailableFileLabel(a)}</span>}
          <span>{formatDateTime(a.sentAt, timeZone)}</span>
        </span>
      </span>
      {url && !open && !docx && <IconDownload size={16} className="shrink-0 text-ink-soft" />}
    </>
  );
  return (
    <li className="flex items-center gap-1">
      {url && docx ? (
        <>
          <button type="button" onClick={() => setDocxOpen(true)} title="Xem file ngay trong kho" className={`${ROW} w-full text-left`}>
            {inner}
          </button>
          {docxOpen && <DocxViewerDialog url={url} fileName={a.fileName} sizeBytes={a.sizeBytes} onClose={() => setDocxOpen(false)} />}
        </>
      ) : url && open ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Mở trong tab mới" className={ROW}>
          {inner}
        </a>
      ) : url ? (
        <a href={downloadUrlOf(url)} download={a.fileName ?? true} title="Tải file về máy" className={ROW}>
          {inner}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1.5">{inner}</div>
      )}
      {url && <RevealInFolderButton attachmentId={a.id} />}
    </li>
  );
}
