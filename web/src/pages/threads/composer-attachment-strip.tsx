import { IconZaloFileTile } from "../../shared/composer-zalo-style-icons";
import { IconClose, IconPlus } from "../../shared/dashboard-icons";
import { formatFileSize } from "../../shared/format-file-size";
import { MAX_FILES_PER_SEND } from "./composer-attachment-rules";
import type { PendingAttachment } from "./use-composer-attachments";

/**
 * Khay file chờ gửi dưới ô nhập, như Zalo PC: dòng "2 file" (toàn ảnh thì "2 ảnh"), mỗi file một ô vuông nền xám - ảnh hiện
 * ảnh nhỏ, file khác hiện tờ giấy xanh + tên; rê chuột vào ô thì hiện nút X để bỏ; ô "+" viền đứt để thêm file cùng loại.
 * Chưa gửi gì: bấm Enter / nút gửi mới gửi cả khay (kèm chữ đang gõ, chữ đi sau cùng).
 */
export function ComposerAttachmentStrip({
  items,
  disabled,
  onRemove,
  onAddMore,
}: {
  items: PendingAttachment[];
  disabled: boolean;
  onRemove: (key: string) => void;
  onAddMore: () => void;
}) {
  if (items.length === 0) return null;
  const allPhotos = items.every((a) => a.as === "photo");
  return (
    <div className="px-3 pb-2.5" aria-label="File chờ gửi">
      <div className="mb-2 text-[14px] font-semibold text-ink">
        {items.length} {allPhotos ? "ảnh" : "file"}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <div key={a.key} className="group relative h-[72px] w-[72px] overflow-hidden rounded-md bg-[#eaedf0] dark:bg-tile" title={`${a.file.name} (${formatFileSize(a.file.size)})`}>
            {a.previewUrl ? (
              <img src={a.previewUrl} alt={a.file.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-1.5">
                <IconZaloFileTile size={22} />
                <div className="w-full truncate text-center text-[12px] leading-tight text-ink">{a.file.name}</div>
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(a.key)}
              title="Bỏ file này"
              aria-label={`Bỏ ${a.file.name}`}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-surface hover:bg-ink focus-visible:flex group-hover:flex disabled:opacity-40"
            >
              <IconClose size={12} />
            </button>
          </div>
        ))}
        {items.length < MAX_FILES_PER_SEND && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAddMore}
            title={allPhotos ? "Thêm ảnh" : "Thêm file"}
            aria-label={allPhotos ? "Thêm ảnh" : "Thêm file"}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-md border-2 border-dashed border-[#c7cdd6] text-ink-soft hover:bg-[#f3f5f7] disabled:opacity-40 dark:border-line dark:hover:bg-tile"
          >
            <IconPlus size={28} />
          </button>
        )}
      </div>
    </div>
  );
}
