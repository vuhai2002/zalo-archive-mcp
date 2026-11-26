import { useState } from "react";
import { api, errorText } from "../dashboard-api-client";
import { IconZaloFolderOutline } from "./composer-zalo-style-icons";

/**
 * Nút thư mục cạnh file đã tải: bấm là daemon mở Explorer ở thư mục "File đã mở" của kho, chọn sẵn đúng file với tên thật
 * (hard link, không tốn thêm chỗ) - để mở bằng app khác, kéo thả, gửi đi... không phải tải về lần nữa. Lỗi (vd không phải
 * Windows) hiện ngay dưới dạng chữ khi rê chuột.
 */
export function RevealInFolderButton({ attachmentId, size = 16, className = "" }: { attachmentId: number; size?: number; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = error ?? "Mở thư mục chứa file";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={(e) => {
        // Nút nằm trong thẻ / dòng file bấm được: không để bấm lan ra mở / tải file
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        setError(null);
        api.attachmentReveal(attachmentId).then(
          () => setBusy(false),
          (err: unknown) => {
            setBusy(false);
            setError(`Không mở được thư mục: ${errorText(err)}`);
          },
        );
      }}
      className={`shrink-0 rounded p-1.5 hover:bg-tile disabled:opacity-50 ${error ? "text-red-500" : "text-ink-soft hover:text-zalo-500"} ${className}`}
    >
      <IconZaloFolderOutline size={size} />
    </button>
  );
}
