import { useState } from "react";
import type { ZaloPcMediaImportStatus } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconZaloFolderOutline } from "../../shared/composer-zalo-style-icons";
import { BTN_SECONDARY, ErrorNote } from "../../shared/ui-bits";

/**
 * Thư mục Zalo PC lưu file (Zalo PC > Cài đặt > Tin nhắn > "File được lưu tại thư mục"): bấm nút có icon thư mục (hoặc bấm vào
 * ô đường dẫn) là mở hộp thoại chọn thư mục của Windows. Trình duyệt không cho trang web biết đường dẫn thật của thư mục chọn,
 * nên daemon (chạy trên chính máy này) mở hộp thoại rồi trả đường dẫn về; yêu cầu chờ tới khi người dùng chọn hoặc bấm Hủy.
 */
export function ZaloPcReceivedFilesDirField({
  data,
  disabled,
  onSaved,
}: {
  data: ZaloPcMediaImportStatus;
  disabled: boolean;
  onSaved: (s: ZaloPcMediaImportStatus) => void;
}) {
  const [busy, setBusy] = useState<"pick" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "pick" | "clear") {
    setBusy(kind);
    setError(null);
    try {
      onSaved(kind === "pick" ? await api.zaloPcReceivedFilesDirPick() : await api.zaloPcReceivedFilesDir(null));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const off = disabled || busy !== null;
  const chosen = data.receivedFilesDir;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="text-[14px] font-medium text-ink">Thư mục Zalo PC lưu file</div>
      <p className="mt-1 text-[12px] text-ink-soft">
        Chọn đúng thư mục đặt trong Zalo PC (Cài đặt &gt; Tin nhắn &gt; File được lưu tại thư mục). Kho chỉ đọc thư mục này.
      </p>
      {error && <ErrorNote message={error} />}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void run("pick")}
          disabled={off}
          title={chosen ?? "Chọn thư mục"}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-[14px] hover:bg-tile disabled:opacity-60"
        >
          <IconZaloFolderOutline size={18} className="shrink-0 text-zalo-500" />
          <span className={`truncate ${chosen ? "text-ink" : "text-ink-soft"}`}>{chosen ?? "Chưa chọn - bấm để chọn thư mục"}</span>
        </button>
        <button type="button" className={BTN_SECONDARY} disabled={off} onClick={() => void run("pick")}>
          {busy === "pick" ? "Đang mở..." : chosen ? "Thay đổi" : "Chọn thư mục"}
        </button>
        {chosen && (
          <button type="button" className={BTN_SECONDARY} disabled={off} onClick={() => void run("clear")}>
            Bỏ chọn
          </button>
        )}
      </div>
      {busy === "pick" && (
        <p className="mt-2 text-[12px] text-ink-soft">Hộp thoại chọn thư mục đã mở trên máy tính - chọn xong bấm "Select Folder".</p>
      )}
      <p className="mt-2 text-[12px] text-ink-soft">
        {data.receivedFilesDirs.length > 0
          ? `Kho sẽ dò: ${data.receivedFilesDirs.join(" · ")}`
          : "Chưa thấy thư mục Zalo Received Files nào trên máy."}
      </p>
    </div>
  );
}
