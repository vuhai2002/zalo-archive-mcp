import { useCallback, useEffect, useState } from "react";
import type { SettingsResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconGear } from "../../shared/dashboard-icons";
import { ErrorNote, LoadingText } from "../../shared/ui-bits";
import { KillSwitchPanel } from "./kill-switch-panel";
import { SendSettingsForm } from "./send-settings-form";

export function SettingsPage() {
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

  // Mọi phản hồi của server đều mang cả khóa khẩn cấp - đẩy lên shell để sidebar đổi theo ngay
  const accept = useCallback(
    (r: SettingsResponse) => {
      setData(r);
      applyKillSwitch(r.killSwitch);
    },
    [applyKillSwitch],
  );

  return (
    <div className="space-y-5">
      <PageHeader icon={IconGear} title="Cài đặt" subtitle="Nhịp gửi, giới hạn và khóa khẩn cấp" />
      {error && <ErrorNote message={error} onRetry={load} />}
      {!data && !error && <LoadingText />}
      {data && (
        <>
          {/* Bản của shell được hỏi lại mỗi 15 giây - Claude/CLI đổi khóa thì trang này cũng thấy */}
          <KillSwitchPanel killSwitch={killSwitch ?? data.killSwitch} onChanged={accept} />
          <SendSettingsForm saved={data.settings} onSaved={accept} />
        </>
      )}
    </div>
  );
}
