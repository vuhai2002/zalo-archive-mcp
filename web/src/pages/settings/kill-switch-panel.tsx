import { useState } from "react";
import type { SettingsResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconLock } from "../../shared/action-and-media-icons";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { formatDateTime } from "../../shared/format-archive-time";
import { Badge, SectionCard, ToggleKnob } from "../../shared/ui-bits";

const MAX_REASON = 200;

/**
 * Khóa khẩn cấp: bật là daemon ngừng gửi MỌI tin (lẻ, lô, hẹn giờ) ngay lập
 * tức; tin vẫn nằm trong hàng đợi, mở khóa là gửi tiếp. Hỏi xác nhận cả hai
 * chiều - bật nhầm thì tin hẹn giờ trễ, tắt nhầm thì tin lỡ duyệt bị gửi đi.
 */
export function KillSwitchPanel({
  killSwitch,
  onChanged,
}: {
  killSwitch: SettingsResponse["killSwitch"];
  onChanged: (r: SettingsResponse) => void;
}) {
  const tz = useArchiveTimeZone();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();
  const killed = killSwitch.killed;

  async function toggle() {
    const ok = await confirm(
      killed
        ? {
            title: "Mở khóa khẩn cấp?",
            message: "Daemon sẽ gửi tiếp các tin đang chờ trong hàng đợi (kể cả tin hẹn giờ đã tới hạn).",
            confirmLabel: "Mở khóa",
            tone: "normal",
          }
        : {
            title: "Bật khóa khẩn cấp?",
            message: "Mọi tin (lẻ, lô, hẹn giờ, Claude gửi) sẽ dừng ngay. Tin vẫn nằm trong hàng đợi cho tới khi mở khóa.",
            confirmLabel: "Bật khóa",
          },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.setKillSwitch(!killed, killed ? undefined : reason.trim() || undefined));
      setReason("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      icon={IconLock}
      title="Khóa khẩn cấp"
      subtitle="Dừng ngay mọi việc gửi tin, không cần tắt daemon"
      aside={killed ? <Badge tone="red">Đang BẬT</Badge> : <Badge tone="green">Đang tắt</Badge>}
    >
      <p className="text-[13px] text-ink-soft">
        {killed
          ? `Bật từ ${formatDateTime(killSwitch.changedAt, tz)}${killSwitch.reason ? ` - lý do: ${killSwitch.reason}` : ""}.`
          : `Lần đổi gần nhất: ${formatDateTime(killSwitch.changedAt, tz)}.`}
      </p>

      {!killed && (
        <div className="mt-4">
          <label htmlFor="kill-reason" className="block text-[13px] font-medium text-ink">
            Lý do (không bắt buộc)
          </label>
          <input
            id="kill-reason"
            value={reason}
            maxLength={MAX_REASON}
            onChange={(e) => setReason(e.target.value)}
            placeholder="vd: nghi Claude gửi nhầm, tạm dừng để kiểm tra"
            className="gc-input mt-1.5 w-full"
          />
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`mt-4 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left disabled:opacity-60 ${
          killed ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40" : "border-line bg-tile/40 hover:bg-tile"
        }`}
      >
        <span className="text-[14px] font-medium text-ink">
          {busy ? "Đang đổi..." : killed ? "Bấm để mở khóa, cho gửi tiếp" : "Bấm để bật khóa, dừng mọi tin"}
        </span>
        <ToggleKnob on={killed} tone="red" />
      </button>
      {error && <p className="mt-2 break-words text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      {confirmDialog}
    </SectionCard>
  );
}
