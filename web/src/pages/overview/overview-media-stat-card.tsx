import type { OverviewResponse } from "../../archive-api-types";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconImage } from "../../shared/action-and-media-icons";
import { formatFileSize } from "../../shared/format-file-size";
import { formatNumber, StatCard } from "../../shared/ui-bits";
import { archiveTotalBytes } from "../settings/storage/storage-display-rules";

/**
 * Thẻ "File đính kèm" của Tổng quan: cùng số với Cài đặt > Quản lý dữ liệu (số file đã tải, dung lượng kho đo trên ổ), kèm số
 * file chưa tải được (link hết hạn, Zalo đã xóa). Bấm để mở Quản lý dữ liệu. Trước đây đếm cả file chưa tải và cộng dung lượng
 * từng tin (file dùng chung bị cộng lặp) nên lệch hẳn so với Quản lý dữ liệu.
 */
export function OverviewMediaStatCard({ storage }: { storage: OverviewResponse["storage"] }) {
  const { openSettings } = useDashboardShell();
  const disk = storage.disk;
  return (
    <button
      type="button"
      onClick={() => openSettings("data")}
      title="Mở Quản lý dữ liệu"
      className="rounded-2xl text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-zalo-500"
    >
      <StatCard
        icon={IconImage}
        label="File đã tải về máy"
        value={formatNumber(storage.downloadedFiles)}
        sub={
          <>
            <span className="block">{disk ? `Kho chiếm ${formatFileSize(archiveTotalBytes(disk))} trên ổ` : "Đang đo dung lượng kho..."}</span>
            {storage.failedFiles > 0 && (
              <span className="block text-amber-700 dark:text-amber-400">{formatNumber(storage.failedFiles)} file chưa tải được (hết hạn / Zalo đã xóa)</span>
            )}
          </>
        }
      />
    </button>
  );
}
