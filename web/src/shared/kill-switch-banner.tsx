import { useState } from "react";
import { api, errorText } from "../dashboard-api-client";
import { useDashboardShell } from "../layout/dashboard-shell-context";
import { useConfirmDialog } from "./confirm-dialog";
import { IconWarning } from "./dashboard-icons";
import { formatDateTime } from "./format-archive-time";

/**
 * Dải đỏ khi khóa khẩn cấp đang bật, kèm nút mở khóa. Không render gì khi khóa
 * tắt - đặt ở đầu trang nào cần nhắc là xong.
 */
export function KillSwitchBanner() {
  const { killSwitch, applyKillSwitch, me } = useDashboardShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  if (!killSwitch?.killed) return null;

  async function unlock() {
    const ok = await confirm({
      title: "Mở khóa khẩn cấp?",
      message: "Daemon sẽ gửi tiếp các tin đang chờ trong hàng đợi (kể cả tin hẹn giờ đã tới hạn).",
      confirmLabel: "Mở khóa",
      tone: "normal",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      applyKillSwitch((await api.setKillSwitch(false)).killSwitch);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 sm:flex-row sm:items-center dark:border-red-800 dark:bg-red-950/50">
      <IconWarning size={22} className="shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1 text-[13px] text-red-800 dark:text-red-200">
        <div className="font-semibold">Khóa khẩn cấp đang BẬT - không tin nào được gửi đi</div>
        <div className="mt-0.5 break-words">
          {killSwitch.reason ? `Lý do: ${killSwitch.reason} · ` : ""}Từ {formatDateTime(killSwitch.changedAt, me.timeZone)}
        </div>
        {error && <div className="mt-1 font-medium">{error}</div>}
      </div>
      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? "Đang mở..." : "Mở khóa"}
      </button>
      {confirmDialog}
    </div>
  );
}
