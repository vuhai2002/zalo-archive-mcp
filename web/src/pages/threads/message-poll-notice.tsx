import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { IconPoll } from "../../shared/action-and-media-icons";
import { IconChevronDown } from "../../shared/dashboard-icons";
import { Badge, LoadingText } from "../../shared/ui-bits";
import { PollDetailDialog, PollStatusNote } from "./poll-detail-dialog";
import { PollOptionsList } from "./poll-options-list";
import { RichMessageText } from "./rich-message-text";
import { usePollView } from "./use-poll-view";

/**
 * Tin bình chọn giữa khung chat như Zalo PC: viên bo tròn có biểu tượng bình chọn, câu "X tham gia cuộc bình chọn: <câu hỏi>"
 * (tên, câu hỏi in đậm) và nút "Xem" mở cửa sổ kết quả. Tin TẠO bình chọn có thêm thẻ bình chọn ngay dưới. Chỉ xem.
 */
export function MessagePollNotice({ msg, title }: { msg: ArchivedMessage; title: string }) {
  const [open, setOpen] = useState(false);
  const pollId = msg.poll!.pollId;
  return (
    <div className="my-3" title={title}>
      <div className="flex justify-center">
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-bubble px-3 py-1 text-[12.5px] text-chat-time shadow-sm [&_.font-semibold]:text-chat-ink">
          <IconPoll size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="line-clamp-1 min-w-0">
            <RichMessageText text={msg.text} styles={msg.textStyles} />
          </div>
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-medium text-zalo-600 hover:underline dark:text-zalo-500">
            Xem
          </button>
        </div>
      </div>
      {msg.poll!.action === "create" && <PollCard pollId={pollId} onOpen={() => setOpen(true)} />}
      {open && <PollDetailDialog pollId={pollId} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Thẻ bình chọn ở chỗ tin tạo, như Zalo: câu hỏi, số người bình chọn, các phương án + số phiếu (không có nút Đổi lựa chọn) */
function PollCard({ pollId, onOpen }: { pollId: string; onOpen: () => void }) {
  const { view, error } = usePollView(pollId);
  return (
    <div className="mx-auto mt-2 w-full max-w-[420px] space-y-2.5 rounded-2xl bg-bubble p-4 shadow-sm">
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      {!view && !error && <LoadingText />}
      {view && (
        <>
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[15.5px] font-semibold leading-snug text-chat-ink [overflow-wrap:anywhere]">{view.question}</h3>
            {view.closed && <Badge tone="gray">Đã khóa</Badge>}
          </div>
          {view.allowMultiChoices && <p className="text-[13px] text-chat-time">Chọn nhiều phương án</p>}
          <PollStatusNote view={view} />
          {view.status !== "pending" && view.options.length > 0 && (
            <>
              <button type="button" onClick={onOpen} className="flex items-center gap-1 text-[13.5px] font-medium text-zalo-600 hover:underline dark:text-zalo-500">
                {view.voterCount} người bình chọn
                <IconChevronDown size={16} className="-rotate-90" />
              </button>
              <PollOptionsList view={view} variant="card" />
            </>
          )}
        </>
      )}
    </div>
  );
}
