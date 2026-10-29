import { Link, useNavigate } from "react-router-dom";
import type { OverviewResponse, TopThread } from "../../archive-api-types";
import { IconChat, IconInbox } from "../../shared/dashboard-icons";
import { IconDatabase } from "../../shared/action-and-media-icons";
import { mediaStatusLabel, outboxStatusLabel, sourceLabel } from "../../shared/archive-status-labels";
import { formatFileSize } from "../../shared/format-file-size";
import { ThreadKindBadge, threadDisplayName } from "../../shared/thread-kind-badge";
import { EmptyState, formatNumber, SectionCard } from "../../shared/ui-bits";

export function TopThreadsPanel({ threads, days }: { threads: TopThread[]; days: number }) {
  const navigate = useNavigate();
  return (
    <SectionCard icon={IconChat} title="Hội thoại sôi nổi nhất" subtitle={`Nhiều tin nhất trong ${days} ngày`}>
      {threads.length === 0 ? (
        <EmptyState text="Chưa có tin nào trong khoảng này." />
      ) : (
        <ul className="-mx-2">
          {threads.map((t, i) => (
            <li key={t.threadId}>
              <button
                type="button"
                onClick={() => navigate(`/threads/${encodeURIComponent(t.threadId)}`)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-tile"
              >
                <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-ink-soft">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{threadDisplayName(t.name)}</span>
                <ThreadKindBadge threadType={t.threadType} />
                <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-ink-soft">
                  {formatNumber(t.messages)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Danh sách "nhãn - số" cho các Record đếm theo trạng thái/nguồn */
function CountRows({ counts, label }: { counts: Record<string, number>; label: (key: string) => string }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return <p className="text-[13px] text-ink-soft/70">Chưa có.</p>;
  return (
    <ul className="space-y-1">
      {entries.map(([key, n]) => (
        <li key={key} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-soft">{label(key)}</span>
          <span className="font-semibold tabular-nums text-ink">{formatNumber(n)}</span>
        </li>
      ))}
    </ul>
  );
}

export function StorageBreakdownPanel({ data }: { data: OverviewResponse }) {
  return (
    <SectionCard icon={IconDatabase} title="Kho lưu trữ" subtitle="Tin theo nguồn và file đính kèm">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-soft/70">Tin theo nguồn</div>
          <CountRows counts={data.bySource} label={sourceLabel} />
        </div>
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-soft/70">
            File đính kèm · {formatFileSize(data.mediaBytes)}
          </div>
          <CountRows counts={data.media} label={mediaStatusLabel} />
        </div>
      </div>
    </SectionCard>
  );
}

export function OutboxCountsPanel({ counts }: { counts: Record<string, number> }) {
  return (
    <SectionCard
      icon={IconInbox}
      title="Hàng đợi gửi"
      subtitle="Số tin theo trạng thái"
      aside={
        <Link to="/outbox" className="text-[13px] font-medium text-zalo-600 hover:underline">
          Mở hàng đợi
        </Link>
      }
    >
      <CountRows counts={counts} label={outboxStatusLabel} />
    </SectionCard>
  );
}
