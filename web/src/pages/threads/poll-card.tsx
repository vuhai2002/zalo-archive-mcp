import { useState } from "react";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconChevronDown } from "../../shared/dashboard-icons";
import { Badge, LoadingText } from "../../shared/ui-bits";
import { PollDetailDialog, PollStatusNote } from "./poll-detail-dialog";
import { pollEndTimeLabel } from "./poll-end-time-label";
import { PollOptionsList } from "./poll-options-list";
import { usePollView } from "./use-poll-view";

/** Thẻ chỉ hiện chừng này phương án như Zalo PC, còn lại ghi "* Còn N lựa chọn khác" */
const CARD_OPTIONS = 3;

/**
 * Thẻ bình chọn như Zalo PC, đặt ngay dưới dòng mới nhất của cuộc bình chọn (xem `pollCardAnchors`): câu hỏi, hạn ("Kết thúc
 * lúc 00:00 Ngày mai"), chọn nhiều phương án, số người bình chọn, tối đa 3 phương án + số phiếu. Bấm số người hay "Còn N lựa
 * chọn khác" thì mở cửa sổ kết quả đầy đủ. CHỈ XEM: không có nút Bình chọn (bình chọn trên Zalo).
 */
export function PollCard({ pollId }: { pollId: string }) {
  const tz = useArchiveTimeZone();
  const { view, error } = usePollView(pollId);
  const [open, setOpen] = useState(false);
  const end = view ? pollEndTimeLabel(view.expiresAt, tz) : null;
  const moreOptions = view ? view.options.length - CARD_OPTIONS : 0;
  const link = "font-medium text-zalo-600 hover:underline dark:text-zalo-500";
  return (
    <div className="mx-auto my-3 w-full max-w-[420px] space-y-2.5 rounded-2xl bg-bubble p-4 shadow-sm">
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      {!view && !error && <LoadingText />}
      {view && (
        <>
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[15.5px] font-semibold leading-snug text-chat-ink [overflow-wrap:anywhere]">{view.question}</h3>
            {view.closed && <Badge tone="gray">Đã khóa</Badge>}
          </div>
          {(end || view.allowMultiChoices) && (
            <div className="space-y-0.5 text-[13px] text-chat-time">
              {end && <p>{end}</p>}
              {view.allowMultiChoices && <p>Chọn nhiều phương án</p>}
            </div>
          )}
          <PollStatusNote view={view} />
          {view.status !== "pending" && view.options.length > 0 && (
            <>
              <button type="button" onClick={() => setOpen(true)} className={`flex items-center gap-1 text-[13.5px] ${link}`}>
                {view.voterCount} người bình chọn
                <IconChevronDown size={16} className="-rotate-90" />
              </button>
              <PollOptionsList view={view} variant="card" limit={CARD_OPTIONS} />
              {moreOptions > 0 && (
                <button type="button" onClick={() => setOpen(true)} className="text-[13.5px] text-chat-time hover:underline">
                  * Còn {moreOptions} lựa chọn khác
                </button>
              )}
            </>
          )}
        </>
      )}
      {open && <PollDetailDialog pollId={pollId} onClose={() => setOpen(false)} />}
    </div>
  );
}
