import { useState, type ReactNode } from "react";
import type { StorageFile } from "../../../archive-api-types";
import { FileTypeBadge } from "../../../shared/file-type-badge";
import { formatFileSize } from "../../../shared/format-file-size";
import { sameOriginUrl } from "../../../shared/same-origin-media-url";
import { previewKind } from "./storage-display-rules";

/**
 * Phần giữa cửa sổ xem nhanh: ảnh hiện vừa khung, video / tin thoại / nhạc phát ngay, file khác (PDF, Word, nén...) hiện
 * thẻ file - mở bằng nút "Mở trong tab mới" ở thanh dưới. Video trình duyệt không phát được thì cũng lùi về thẻ file.
 * Gắn `key` theo file để đổi file là dựng lại (dừng video cũ, xóa cờ lỗi).
 */
export function StorageFilePreviewStage({ file }: { file: StorageFile }) {
  const url = sameOriginUrl(file.url);
  const [broken, setBroken] = useState(false);
  const kind = broken ? "file" : previewKind(file);

  if (!url) return <FileCard file={file} note="File không còn trên máy." />;
  if (kind === "image") return <img src={url} alt={file.fileName ?? ""} onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" />;
  if (kind === "video") return <video src={url} controls autoPlay onError={() => setBroken(true)} className="max-h-full max-w-full" />;
  if (kind === "audio") {
    return (
      <FileCard file={file}>
        <audio src={url} controls autoPlay onError={() => setBroken(true)} className="mt-4 w-[min(420px,80vw)]" />
      </FileCard>
    );
  }
  return <FileCard file={file} note={broken ? "Trình duyệt không phát được file này." : "Không xem trước được loại file này trong kho."} />;
}

function FileCard({ file, note, children }: { file: StorageFile; note?: string; children?: ReactNode }) {
  const name = file.fileName ?? (file.kind === "voice" ? "Tin nhắn thoại" : "File");
  return (
    <div className="flex max-w-md flex-col items-center rounded-2xl bg-white/10 px-8 py-7 text-center">
      <FileTypeBadge name={file.fileName ?? (file.kind === "voice" ? "tin-thoai.aac" : "file")} size={72} />
      <p className="mt-3 break-all text-[15px] font-medium">{name}</p>
      <p className="mt-0.5 text-[13px] text-white/70">{formatFileSize(file.sizeBytes)}</p>
      {note && <p className="mt-2 text-[13px] text-white/70">{note}</p>}
      {children}
    </div>
  );
}
