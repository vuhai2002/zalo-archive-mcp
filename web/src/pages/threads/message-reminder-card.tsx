import type { ArchivedMessage } from "../../archive-api-types";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconClock, IconRefresh } from "../../shared/action-and-media-icons";
import { formatClock } from "../../shared/format-archive-time";
import { calendarTileParts, relativeDayLabel } from "../../shared/relative-day-label";

type Reminder = NonNullable<ArchivedMessage["reminder"]>;

const REPEAT_LABEL: Record<NonNullable<Reminder["repeat"]>, string> = {
  daily: "Nhắc theo ngày",
  weekly: "Nhắc theo tuần",
  monthly: "Nhắc theo tháng",
  yearly: "Nhắc theo năm",
};

/**
 * Thẻ nhắc hẹn của nhóm như Zalo PC (tin Zalo gửi lúc tới giờ hẹn): ô lịch "THỨ TƯ / 11 / THÁNG 3", tên hẹn, "Hôm nay lúc
 * 10:15", kiểu lặp. CHỈ XEM: không có số người tham gia / từ chối (không có trong tin) và không có nút Tham gia / Từ chối.
 */
export function MessageReminderCard({ reminder, title }: { reminder: Reminder; title: string }) {
  const tz = useArchiveTimeZone();
  const tile = calendarTileParts(reminder.startAt, tz);
  return (
    <div className="my-3 flex justify-center" title={title}>
      <div className="flex w-full max-w-[434px] items-center gap-4 rounded-xl bg-bubble p-4 shadow-sm">
        <div className="w-[84px] shrink-0 overflow-hidden rounded-lg bg-white text-center shadow-[0_1px_4px_rgba(0,0,0,0.18)] dark:bg-white/10">
          <div className="bg-[#0068ff] py-1.5 text-[10px] font-semibold tracking-wide text-white">{tile.weekday}</div>
          <div className="pt-2 text-[38px] font-semibold leading-none text-chat-ink">{tile.day}</div>
          <div className="pb-2.5 pt-2 text-[10.5px] font-medium text-chat-ink">{tile.month}</div>
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-[14px] text-chat-ink">
          <div className="truncate text-[16px] font-semibold">{reminder.title}</div>
          <div className="flex items-center gap-2">
            <IconClock size={17} className="shrink-0" />
            {relativeDayLabel(reminder.startAt, tz)} lúc {formatClock(reminder.startAt, tz)}
          </div>
          {reminder.repeat && (
            <div className="flex items-center gap-2">
              <IconRefresh size={17} className="shrink-0" />
              {REPEAT_LABEL[reminder.repeat]}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
