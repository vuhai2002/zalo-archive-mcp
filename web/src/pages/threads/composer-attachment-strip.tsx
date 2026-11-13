import { IconFileText } from "../../shared/action-and-media-icons";
import { IconClose } from "../../shared/dashboard-icons";
import { formatFileSize } from "../../shared/format-file-size";
import type { PendingAttachment } from "./use-composer-attachments";

/** Khay file chờ gửi phía trên ô nhập (dán / kéo thả): ảnh hiện ảnh nhỏ, file khác hiện tên + cỡ; nút X bỏ từng file */
export function ComposerAttachmentStrip({ items, disabled, onRemove }: { items: PendingAttachment[]; disabled: boolean; onRemove: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-2" aria-label="File chờ gửi">
      {items.map((a) => (
        <div key={a.key} className="relative">
          {a.previewUrl ? (
            <img src={a.previewUrl} alt={a.file.name} title={a.file.name} className="h-16 w-16 rounded-md border border-line object-cover" />
          ) : (
            <div className="flex h-16 w-44 items-center gap-2 rounded-md border border-line bg-tile/40 px-2" title={a.file.name}>
              <IconFileText size={22} className="shrink-0 text-zalo-500" />
              <div className="min-w-0 text-[12px] leading-tight">
                <div className="truncate font-medium text-ink">{a.file.name}</div>
                <div className="text-ink-soft">{formatFileSize(a.file.size)}</div>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(a.key)}
            title="Bỏ file này"
            aria-label={`Bỏ ${a.file.name}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-surface hover:bg-ink disabled:opacity-40"
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
