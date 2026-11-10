import { useCallback, useEffect, useRef, useState } from "react";
import type { OverviewResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconChat, IconGrid, IconMessage, IconUsers } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { SelectMenu } from "../../shared/select-menu";
import { useElementHeight } from "../../shared/use-element-height";
import { listenerRetryText, SESSION_STATE_LABEL } from "../../shared/session-state-labels";
import { ErrorNote, formatNumber, LoadingText, SectionCard, StatCard } from "../../shared/ui-bits";
import { DailyMessageBarChart } from "./daily-message-bar-chart";
import { OutboxCountsPanel, StorageBreakdownPanel, TopThreadsPanel } from "./overview-breakdown-panels";
import { OverviewMediaStatCard } from "./overview-media-stat-card";
import { ConnectionEventsPanel, ListenerGapsPanel } from "./overview-connection-panels";
import { PhoneSyncGapBanner } from "./phone-sync-gap-banner";

const DAY_OPTIONS = [7, 14, 30, 90].map((d) => ({ value: String(d), label: `${d} ngày` }));

export function OverviewPage() {
  const { me, session, openSettings } = useDashboardShell();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Chiều cao khung Kho lưu trữ + Hàng đợi: ba khung cùng lưới cao bằng nó (chưa đo được thì để cao tự nhiên)
  const [firstPanelEl, firstPanel] = useState<HTMLDivElement | null>(null);
  const firstPanelHeight = useElementHeight(firstPanelEl);
  const panelHeight = firstPanelHeight ? { height: firstPanelHeight } : undefined;

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
            <OverviewMediaStatCard storage={data.storage} />
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

          {/* Bốn khung cao bằng nhau, lấy theo khung Kho lưu trữ + Hàng đợi (nội dung tự nhiên, ngắn nhất); ba khung còn lại
              cuộn bên trong thay vì dài ra */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* self-start: không để lưới kéo giãn theo khung bên cạnh, đo đúng chiều cao tự nhiên */}
            <div ref={firstPanel} className="flex flex-col gap-5 self-start">
              <StorageBreakdownPanel data={data} />
              <OutboxCountsPanel counts={data.outbox} />
            </div>
            <div style={panelHeight}>
              <TopThreadsPanel threads={data.topThreads} days={days} />
            </div>
            <div style={panelHeight}>
              <ConnectionEventsPanel events={data.recentEvents} />
            </div>
            <div style={panelHeight}>
              <ListenerGapsPanel gaps={data.gaps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
