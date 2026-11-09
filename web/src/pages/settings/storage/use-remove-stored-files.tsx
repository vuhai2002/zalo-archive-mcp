import { useCallback, useEffect, useState } from "react";
import type { StorageRemoveRequest } from "../../../archive-api-types";
import { api, errorText } from "../../../dashboard-api-client";
import { useConfirmDialog } from "../../../shared/confirm-dialog";
import { formatFileSize } from "../../../shared/format-file-size";

const NOTICE_MS = 4_000;

/**
 * Luồng "Xóa dữ liệu" dùng chung cho danh sách hội thoại và lưới file: hỏi máy chủ cái sẽ mất (số file, dung lượng giải phóng,
 * số file dùng chung còn giữ trên ổ), hỏi lại người dùng, rồi xóa FILE - tin nhắn vẫn giữ. Xong thì báo nhỏ ở đáy.
 */
export function useRemoveStoredFiles(onRemoved: () => void) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const remove = useCallback(
    async (target: StorageRemoveRequest) => {
      setBusy(true);
      try {
        const p = await api.storageRemovePreview(target);
        if (p.files === 0) return setNotice("Không còn file nào để xóa.");
        const shared = p.shared > 0 ? ` ${p.shared} file dùng chung với tin khác nên vẫn giữ trên ổ cho tin kia.` : "";
        const ok = await confirm({
          title: `Xóa ${p.files.toLocaleString("vi-VN")} file khỏi kho?`,
          message:
            `Giải phóng khoảng ${formatFileSize(p.bytes)} trên ổ.${shared} Tin nhắn vẫn giữ, chỗ file hiện "Đã xóa file khỏi kho". ` +
            "Chỉ xóa trong kho, Zalo vẫn còn. Không khôi phục được, và kho sẽ không tải lại các file này.",
          confirmLabel: "Xóa dữ liệu",
        });
        if (!ok) return;
        const r = await api.storageRemove(target);
        setNotice(`Đã xóa ${r.removed.toLocaleString("vi-VN")} file, giải phóng ${formatFileSize(r.bytes)}.`);
        onRemoved();
      } catch (err) {
        setNotice(`Không xóa được: ${errorText(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [confirm, onRemoved],
  );

  const overlay = (
    <>
      {confirmDialog}
      {notice && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-8">
          <span className="rounded-full bg-ink/85 px-4 py-2 text-[13px] text-surface shadow-lg">{notice}</span>
        </div>
      )}
    </>
  );
  return { remove, busy, overlay };
}
