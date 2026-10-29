import type { ConnectionEvent, ListenerGap } from "../../archive-api-types";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconSignal } from "../../shared/dashboard-icons";
import { IconClock } from "../../shared/action-and-media-icons";
import { eventKindInfo } from "../../shared/archive-status-labels";
import { formatDateTime, formatDuration } from "../../shared/format-archive-time";
import { Badge, EmptyState, SectionCard } from "../../shared/ui-bits";

/**
 * Khoảng listener mất kết nối trong 7 ngày. Khoảng `suspected` (server nghi có
 * tin bị lọt trong lúc mất kết nối) tô đỏ: đó là chỗ kho có thể đang thiếu tin
 * mà không ai biết nếu không nhìn vào đây.
 */
export function ListenerGapsPanel({ gaps }: { gaps: ListenerGap[] }) {
  const tz = useArchiveTimeZone();
  const suspected = gaps.filter((g) => g.suspected).length;
  return (
    <SectionCard
      icon={IconClock}
      title="Khoảng mất kết nối"
      subtitle="7 ngày gần nhất - lúc listener không nghe được tin"
      aside={suspected > 0 ? <Badge tone="red">{suspected} khoảng nghi mất tin</Badge> : undefined}
    >
      {gaps.length === 0 ? (
        <EmptyState text="Không có khoảng mất kết nối nào." />
      ) : (
        <ul className="space-y-2">
          {gaps.map((g, i) => (
            <li
              key={`${g.from}-${i}`}
              className={`rounded-xl border px-3 py-2.5 text-[13px] ${
                g.suspected
                  ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  : "border-line bg-tile/40 text-ink"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {formatDateTime(g.from, tz)} - {g.to ? formatDateTime(g.to, tz) : "vẫn đang mất"}
                </span>
                <span className="text-[12px] opacity-80">{formatDuration(g.from, g.to)}</span>
              </div>
              <div className="mt-0.5 text-[12px] opacity-80">
                {g.suspected ? "Nghi có tin bị lọt trong khoảng này" : "Không thấy dấu hiệu mất tin"}
                {g.closeCode !== null && ` · mã đóng ${g.closeCode}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function ConnectionEventsPanel({ events }: { events: ConnectionEvent[] }) {
  const tz = useArchiveTimeZone();
  return (
    <SectionCard icon={IconSignal} title="Sự kiện kết nối" subtitle="20 sự kiện gần nhất của phiên Zalo">
      {events.length === 0 ? (
        <EmptyState text="Chưa có sự kiện nào." />
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e, i) => {
            const info = eventKindInfo(e.kind);
            return (
              <li key={`${e.at}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-[13px]">
                <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-soft">{formatDateTime(e.at, tz)}</span>
                <Badge tone={info.tone}>{info.label}</Badge>
                {e.code !== null && <span className="text-ink-soft">mã {e.code}</span>}
                {e.detail && <span className="min-w-0 basis-full break-words text-[12px] text-ink-soft sm:basis-auto sm:flex-1">{e.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
