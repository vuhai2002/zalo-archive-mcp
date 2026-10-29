import type { ThreadMessagesResponse } from "../../archive-api-types";
import { useState } from "react";
import { errorText } from "../../dashboard-api-client";
import { IconClose, IconPin } from "../../shared/dashboard-icons";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { BTN_ICON } from "../../shared/ui-bits";
import { chatSubtitle, ThreadAvatar } from "./thread-chat-header";
import { setThreadPinned } from "./thread-pin-actions";
import { ThreadSharedMediaSection } from "./thread-shared-media-section";

/**
 * Bảng "Thông tin hội thoại" bên phải khung chat như Zalo PC: ảnh đại diện, tên, số thành viên,
 * lưới Ảnh/Video và danh sách File gần đây. Từ xl là một cột cố định; nhỏ hơn thì phủ lên khung chat.
 */
export function ThreadInfoPanel({
  thread,
  timeZone,
  onClose,
}: {
  thread: ThreadMessagesResponse["thread"];
  timeZone: string;
  onClose: () => void;
}) {
  const [pinned, setPinned] = useState(thread.pinned);
  const [pinError, setPinError] = useState<string | null>(null);
  const togglePin = () => {
    setPinError(null);
    setThreadPinned(thread.threadId, !pinned).then(setPinned, (err: unknown) => setPinError(errorText(err)));
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[340px] max-w-full flex-col border-l border-line bg-surface shadow-xl xl:static xl:shadow-none">
      <div className="flex h-[68px] shrink-0 items-center border-b border-line px-4">
        <h3 className="flex-1 text-center text-[17px] font-semibold text-ink">
          {thread.threadType === "group" ? "Thông tin nhóm" : "Thông tin hội thoại"}
        </h3>
        <button type="button" onClick={onClose} aria-label="Đóng thông tin hội thoại" className={BTN_ICON}>
          <IconClose size={18} />
        </button>
      </div>
      <div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 border-b-8 border-tile px-4 pb-5 pt-5 text-center">
          <ThreadAvatar thread={thread} size="xl" />
          <div className="mt-1 text-[17px] font-semibold text-ink">{threadDisplayName(thread.name)}</div>
          <div className="text-[13px] text-ink-soft">{chatSubtitle(thread)}</div>
          <div className="font-mono text-[11px] text-ink-soft/70">{thread.threadId}</div>
          <button
            type="button"
            onClick={togglePin}
            className="mt-2 flex flex-col items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
            title={pinned ? "Bỏ ghim hội thoại khỏi đầu danh sách" : "Ghim hội thoại lên đầu danh sách"}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${pinned ? "bg-zalo-50 text-zalo-500 dark:bg-zalo-500/15" : "bg-tile"}`}>
              <IconPin size={17} className={pinned ? "fill-current" : ""} />
            </span>
            {pinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
          </button>
          {pinError && <p className="text-[12px] text-red-600 dark:text-red-400">{pinError}</p>}
        </div>
        <ThreadSharedMediaSection threadId={thread.threadId} kind="visual" timeZone={timeZone} />
        <ThreadSharedMediaSection threadId={thread.threadId} kind="file" timeZone={timeZone} />
      </div>
    </aside>
  );
}
