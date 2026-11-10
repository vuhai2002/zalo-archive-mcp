import { useState } from "react";
import type { ConnectionEvent, ListenerGap } from "../../archive-api-types";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconSignal } from "../../shared/dashboard-icons";
import { IconClock } from "../../shared/action-and-media-icons";
import { eventKindInfo } from "../../shared/archive-status-labels";
import { formatClock, formatDateTime, formatDuration } from "../../shared/format-archive-time";
import { Badge, EmptyState, SectionCard } from "../../shared/ui-bits";
import { gapReason, isQuickGap, QUICK_GAP_MS, shortEventDetail, visibleConnectionEvents } from "./connection-panel-display";

/** Nút chữ nhỏ cuối mục: "Xem tất cả" / "Thu gọn" */
function ToggleMore({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[13px] font-medium text-zalo-600 hover:underline">
      {expanded ? "Thu gọn" : `Xem tất cả (${total})`}
    </button>
  );
}

/** "12/03 08:00 - 13/03 10:30"; cùng ngày thì vế sau chỉ còn giờ: "12/03 09:15 - 09:20" */
function gapRange(g: ListenerGap, tz: string): string {
  const from = formatDateTime(g.from, tz);
  if (!g.to) return `${from} - vẫn đang mất`;
  const to = formatDateTime(g.to, tz);
  return from.split(" ")[0] === to.split(" ")[0] ? `${from} - ${formatClock(g.to, tz)}` : `${from} - ${to}`;
}

/**
 * Khoảng listener không nghe được tin trong 7 ngày, mỗi khoảng một dòng: giờ, lý do, thời lượng. Thẻ cao cố định (bằng khung
 * Kho lưu trữ + Hàng đợi), danh sách cuộn bên trong. Khoảng dưới 2 phút (khởi động lại daemon, chớp mạng) ẩn, gộp thành dòng đếm
 * ghim ở đáy kèm "Xem tất cả" (mở ra ngay trong vùng cuộn, thẻ không dài ra); khoảng nghi mất tin (`suspected`) tô đỏ - đó là
 * chỗ kho có thể đang thiếu tin mà không ai biết nếu không nhìn vào đây.
 */
export function ListenerGapsPanel({ gaps }: { gaps: ListenerGap[] }) {
  const tz = useArchiveTimeZone();
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const suspected = gaps.filter((g) => g.suspected).length;
  const notable = gaps.filter((g) => !isQuickGap(g, now));
  const quickCount = gaps.length - notable.length;
  const shown = expanded ? gaps : notable;
  const footer =
    quickCount > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[12.5px] text-ink-soft">
        <span>{expanded ? "" : `Ẩn ${quickCount} lần nối lại nhanh dưới ${QUICK_GAP_MS / 60_000} phút (khởi động lại daemon, chớp mạng)`}</span>
        <ToggleMore expanded={expanded} total={gaps.length} onToggle={() => setExpanded((v) => !v)} />
      </div>
    ) : undefined;
  return (
    <SectionCard
      icon={IconClock}
      title="Khoảng mất kết nối"
      subtitle="7 ngày gần nhất - lúc listener không nghe được tin"
      aside={suspected > 0 ? <Badge tone="red">{suspected} khoảng nghi mất tin</Badge> : undefined}
      fill
      footer={footer}
    >
      {gaps.length === 0 ? (
        <EmptyState text="Không có khoảng mất kết nối nào." />
      ) : shown.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-soft">Chỉ có các lần nối lại nhanh dưới {QUICK_GAP_MS / 60_000} phút.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((g, i) => {
            const reason = gapReason(g);
            return (
              <li
                key={`${g.from}-${i}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px] ${g.suspected ? "text-red-700 dark:text-red-300" : "text-ink"}`}
              >
                <span className="whitespace-nowrap font-medium tabular-nums">{gapRange(g, tz)}</span>
                <Badge tone={reason.tone}>{reason.label}</Badge>
                <span className="ml-auto whitespace-nowrap text-[12px] tabular-nums text-ink-soft">{formatDuration(g.from, g.to)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * Lần mất / có kết nối gần nhất của phiên Zalo (bỏ "Đăng nhập" - luôn đi liền "Đã kết nối"). Thẻ cao cố định, hiện hết các sự
 * kiện server trả về trong vùng cuộn (không cần "Xem tất cả" kéo thẻ dài ra).
 */
export function ConnectionEventsPanel({ events }: { events: ConnectionEvent[] }) {
  const tz = useArchiveTimeZone();
  const visible = visibleConnectionEvents(events);
  return (
    <SectionCard icon={IconSignal} title="Sự kiện kết nối" subtitle="Mất / có kết nối gần nhất của phiên Zalo" fill>
      {visible.length === 0 ? (
        <EmptyState text="Chưa có sự kiện nào." />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((e, i) => {
            const info = eventKindInfo(e.kind);
            const detail = shortEventDetail(e.detail);
            return (
              <li key={`${e.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-soft">{formatDateTime(e.at, tz)}</span>
                <Badge tone={info.tone}>{info.label}</Badge>
                {e.code !== null && <span className="text-ink-soft">mã {e.code}</span>}
                {detail && <span className="min-w-0 break-words text-[12px] text-ink-soft">{detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
