import type { StorageFile } from "../../../archive-api-types";
import { IconPlay } from "../../../shared/action-and-media-icons";
import { IconCheck } from "../../../shared/dashboard-icons";
import { FileTypeBadge } from "../../../shared/file-type-badge";
import { formatFileSize } from "../../../shared/format-file-size";
import { sameOriginUrl } from "../../../shared/same-origin-media-url";
import { formatDuration } from "./storage-display-rules";

/**
 * Một ô trong lưới file như Zalo điện thoại: ảnh / video hiện hình (video lấy khung đầu), file / tin thoại hiện biểu tượng + tên;
 * góc dưới là dung lượng (+ thời lượng video). Như Zalo PC: bấm vào ô để XEM (`onOpen`), bấm vòng tròn góc trên phải để CHỌN
 * (`onToggle`) - hai nút riêng. File dùng chung với tin khác có nhãn nhỏ.
 */
export function StorageFileTile({
  file: f,
  selected = false,
  compact = false,
  onToggle,
  onOpen,
}: {
  file: StorageFile;
  selected?: boolean;
  /** Ô nhỏ ở dải xem trước (không chọn, không mở được) */
  compact?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const url = sameOriginUrl(f.url);
  const visual = f.kind === "photo" || f.kind === "gif" || f.kind === "video";
  const duration = formatDuration(f.durationMs);
  const title = [f.fileName, f.threadName, formatFileSize(f.sizeBytes)].filter(Boolean).join(" - ");

  return (
    <div title={title} className={`relative aspect-square overflow-hidden rounded-md border border-line bg-tile ${selected ? "ring-2 ring-zalo-500" : ""}`}>
      {visual && url ? (
        f.kind === "video" ? (
          <video src={`${url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        )
      ) : (
        // File / tin thoại như Zalo điện thoại: biểu tượng loại file, tên (2 dòng), dung lượng - xếp dọc, không đè nhau
        <div className="flex h-full flex-col p-2">
          <FileTypeBadge name={f.fileName ?? (f.kind === "voice" ? "tin-thoai.aac" : "file")} size={compact ? 32 : 40} />
          <div className={`mt-1.5 min-h-0 flex-1 overflow-hidden break-all leading-snug text-ink ${compact ? "line-clamp-1 text-[11px]" : "line-clamp-2 text-[12.5px]"}`}>
            {f.fileName ?? (f.kind === "voice" ? "Tin nhắn thoại" : "File")}
          </div>
          <div className="flex items-center gap-1">
            <span className={`font-semibold tabular-nums text-ink ${compact ? "text-[11px]" : "text-[12.5px]"}`}>{formatFileSize(f.sizeBytes)}</span>
            {!compact && f.sharedWith > 0 && <SharedChip />}
          </div>
        </div>
      )}
      {visual && (
        <>
          {f.kind === "video" && (
            <span className="absolute left-1.5 top-1.5 rounded bg-black/45 p-0.5 text-white">
              <IconPlay size={12} />
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-white">
            <span className={`font-semibold tabular-nums ${compact ? "text-[11px]" : "text-[12.5px]"}`}>{formatFileSize(f.sizeBytes)}</span>
            {!compact && f.sharedWith > 0 && <SharedChip />}
            {duration && <span className="ml-auto text-[11.5px] tabular-nums">{duration}</span>}
          </div>
        </>
      )}
      {/* Phủ cả ô: bấm để xem nhanh (nằm trên hình / video để video không bắt cú bấm) */}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Xem ${f.fileName ?? "file"}`}
          className="absolute inset-0 z-[1] cursor-zoom-in hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-zalo-500"
        />
      )}
      {/* Vòng chọn: vùng bấm rộng hơn hình tròn cho dễ trúng */}
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Bỏ chọn file" : "Chọn file"}
          onClick={onToggle}
          className="absolute right-0 top-0 z-[2] p-1.5"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-zalo-500 bg-zalo-500 text-white" : "border-white bg-black/20 hover:bg-black/40"}`}
          >
            {selected && <IconCheck size={13} strokeWidth={3} />}
          </span>
        </button>
      )}
    </div>
  );
}

/** Nhãn "Dùng chung": tin khác cũng dùng đúng file này - xóa ở đây thì ổ chưa trống ra */
function SharedChip() {
  return (
    <span title="Tin khác cũng dùng đúng file này: xóa ở đây thì file vẫn giữ trên ổ cho tin kia" className="rounded bg-amber-500/90 px-1 text-[10.5px] font-medium text-white">
      Dùng chung
    </span>
  );
}
