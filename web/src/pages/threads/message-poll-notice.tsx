import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { IconPoll } from "../../shared/action-and-media-icons";
import { PollDetailDialog } from "./poll-detail-dialog";
import { RichMessageText } from "./rich-message-text";

/**
 * Tin bình chọn giữa khung chat như Zalo PC: viên bo tròn có biểu tượng bình chọn, câu "X tham gia cuộc bình chọn: <câu hỏi>"
 * (tên, câu hỏi in đậm) và nút "Xem" mở cửa sổ kết quả. Thẻ bình chọn KHÔNG nằm ở đây: danh sách tin đặt nó dưới dòng mới
 * nhất của cuộc bình chọn (`PollCard`, `pollCardAnchors`). Chỉ xem.
 */
export function MessagePollNotice({ msg, title }: { msg: ArchivedMessage; title: string }) {
  const [open, setOpen] = useState(false);
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
      {open && <PollDetailDialog pollId={msg.poll!.pollId} onClose={() => setOpen(false)} />}
    </div>
  );
}
