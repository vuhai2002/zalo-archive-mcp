import { useCallback, useEffect, useRef, useState } from "react";
import type { OverviewResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconImage } from "../../shared/action-and-media-icons";
import { IconChat, IconGrid, IconMessage, IconUsers } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { formatFileSize } from "../../shared/format-file-size";
import { SelectMenu } from "../../shared/select-menu";
import { listenerRetryText, SESSION_STATE_LABEL } from "../../shared/session-state-labels";
import { ErrorNote, formatNumber, LoadingText, SectionCard, StatCard } from "../../shared/ui-bits";
import { DailyMessageBarChart } from "./daily-message-bar-chart";
import { OutboxCountsPanel, StorageBreakdownPanel, TopThreadsPanel } from "./overview-breakdown-panels";
import { ConnectionEventsPanel, ListenerGapsPanel } from "./overview-connection-panels";
import { PhoneSyncGapBanner } from "./phone-sync-gap-banner";

const DAY_OPTIONS = [7, 14, 30, 90].map((d) => ({ value: String(d), label: `${d} ngày` }));

export function OverviewPage() {
  const { me, session, openSettings } = useDashboardShell();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Đổi khoảng ngày liên tiếp: chỉ nhận kết quả của lần hỏi MỚI NHẤT
  const requestSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    setError(null);
    api
      .overview(days)
      .then((r) => seq === requestSeq.current && setData(r))
      .catch((err: unknown) => seq === requestSeq.current && setError(errorText(err)));
  }, [days]);

  useEffect(load, [load]);

  const tz = me.timeZone;
  // Phiên không chạy thì kho KHÔNG nhận tin mới - phải nói ngay ở trang đầu tiên
  const notListening = session !== null && !(session.state === "running" && session.listenerConnected);

  return (
    <div>
      <PageHeader icon={IconGrid} title="Tổng quan" subtitle="Số liệu kho tin nhắn và tình trạng kết nối" />

      {notListening && session && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-semibold">Kho đang không nhận tin mới</span> - phiên Zalo:{" "}
          {session.state === "running" ? (listenerRetryText(session, tz) ?? "listener chưa kết nối") : SESSION_STATE_LABEL[session.state]}.{" "}
          <button type="button" onClick={() => openSettings("account")} className="font-medium underline underline-offset-2">
            Mở Tài khoản Zalo
          </button>
        </div>
      )}

      <PhoneSyncGapBanner timeZone={tz} />

      {error && (
        <div className="mb-5">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {!data && !error && <LoadingText />}

      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={IconMessage}
              label="Tổng tin nhắn"
              value={formatNumber(data.totals.messages)}
              sub={data.totals.oldestMessageAt ? `Từ ${formatDateTime(data.totals.oldestMessageAt, tz)}` : "Kho còn trống"}
            />
            <StatCard
              icon={IconChat}
              label="Tin hôm nay"
              value={formatNumber(data.totals.messagesToday)}
              sub={`Tôi gửi ${formatNumber(data.totals.sentByMeToday)}`}
            />
            <StatCard
              icon={IconUsers}
              label="Hội thoại"
              value={formatNumber(data.totals.threads)}
              sub={`${formatNumber(data.totals.groups)} nhóm · ${formatNumber(data.totals.friends)} bạn bè`}
            />
            <StatCard
              icon={IconImage}
              label="File đính kèm"
              value={formatNumber(Object.values(data.media).reduce((a, n) => a + n, 0))}
              sub={`Đã lưu ${formatFileSize(data.mediaBytes)}`}
            />
          </div>

          <SectionCard
            title="Tin theo ngày"
            subtitle={`Tin mới nhất: ${formatDateTime(data.totals.newestMessageAt, tz)}`}
            aside={
              <div className="w-32">
                <SelectMenu
                  value={String(days)}
                  options={DAY_OPTIONS}
                  onChange={(v) => setDays(Number(v))}
                  ariaLabel="Khoảng thời gian"
                />
              </div>
            }
          >
            <DailyMessageBarChart data={data.daily} />
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <TopThreadsPanel threads={data.topThreads} days={days} />
            <ListenerGapsPanel gaps={data.gaps} />
            <ConnectionEventsPanel events={data.recentEvents} />
            <div className="space-y-5">
              <StorageBreakdownPanel data={data} />
              <OutboxCountsPanel counts={data.outbox} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
