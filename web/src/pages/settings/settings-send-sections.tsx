import { useCallback, useEffect, useState } from "react";
import type { SettingsResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { ErrorNote, LoadingText } from "../../shared/ui-bits";
import { KillSwitchPanel } from "./kill-switch-panel";
import { SendSettingsForm } from "./send-settings-form";

/** Cài đặt gửi + khóa khẩn cấp dùng chung một lần tải; mọi phản hồi mang cả khóa khẩn cấp nên đẩy lên shell cho sidebar đổi ngay */
function useSendSettings() {
  const { applyKillSwitch, killSwitch } = useDashboardShell();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api
      .settings()
      .then(setData)
      .catch((err: unknown) => setError(errorText(err)));
  }, []);
  useEffect(load, [load]);
  const accept = useCallback(
    (r: SettingsResponse) => {
      setData(r);
      applyKillSwitch(r.killSwitch);
    },
    [applyKillSwitch],
  );
  const status = error ? <ErrorNote message={error} onRetry={load} /> : !data ? <LoadingText /> : null;
  return { data, accept, killSwitch, status };
}

/** Cài đặt > Gửi tin và giới hạn: nhịp gửi tin lẻ, lô gửi nhiều người, khung giờ, trần ngày */
export function SendSection() {
  const s = useSendSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-[18px] font-semibold text-ink">Gửi tin và giới hạn</h2>
      {s.status}
      {s.data && <SendSettingsForm saved={s.data.settings} onSaved={s.accept} />}
    </div>
  );
}

/** Cài đặt > Khóa khẩn cấp: dừng ngay mọi tin đang chờ gửi */
export function KillSwitchSection() {
  const s = useSendSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-[18px] font-semibold text-ink">Khóa khẩn cấp</h2>
      {s.status}
      {/* Bản của shell được hỏi lại mỗi 15 giây - Claude/CLI đổi khóa thì mục này cũng thấy */}
      {s.data && <KillSwitchPanel killSwitch={s.killSwitch ?? s.data.killSwitch} onChanged={s.accept} />}
    </div>
  );
}
