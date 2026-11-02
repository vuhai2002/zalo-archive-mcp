import { MessageBubble } from "./message-bubble";
import type { MessageLayout } from "./message-grouping";
import type { ChatItem } from "./photo-album-grouping";

/**
 * Một mục trong khung chat: vạch giờ (nếu có) rồi bong bóng tin / khung album. Mục được bọc trong
 * phần tử mang `data-msg-ids` (id tin, cùng id các ảnh của album) để nhảy tới tin từ kết quả tìm, và
 * tô nền một lúc khi đó là tin vừa nhảy tới.
 */
export function ChatItemRow({
  item: { msg: m, album },
  layout,
  highlighted,
  isGroup,
  timeZone,
  onMediaLoad,
  onMediaRetried,
  onJumpToMessage,
}: {
  item: ChatItem;
  layout: MessageLayout;
  highlighted: boolean;
  isGroup: boolean;
  timeZone: string;
  onMediaLoad: () => void;
  onMediaRetried: () => void;
  /** Bấm ô trích dẫn: nhảy tới tin gốc */
  onJumpToMessage: (id: number) => void;
}) {
  return (
    <>
      {layout.separatorLabel && (
        <div className="mb-1 mt-4 flex justify-center first:mt-1">
          <span className="rounded-full bg-black/25 px-3 py-1 text-[12px] font-medium text-white dark:bg-white/15">{layout.separatorLabel}</span>
        </div>
      )}
      <div
        data-msg-ids={[m.id, ...(album?.map((p) => p.id) ?? [])].join(" ")}
        className={`rounded-xl transition-colors duration-700 ${highlighted ? "bg-amber-300/40 dark:bg-amber-400/20" : ""}`}
      >
        <MessageBubble
          msg={m}
          album={album}
          isGroup={isGroup}
          timeZone={timeZone}
          first={layout.firstInGroup}
          last={layout.lastInGroup}
          onMediaLoad={onMediaLoad}
          onMediaRetried={onMediaRetried}
          onJumpToMessage={onJumpToMessage}
        />
      </div>
    </>
  );
}

/** Mục có chứa tin này không (chính nó, hoặc một ảnh trong album) */
export const itemHasMessage = (item: ChatItem, id: number | null) =>
  id !== null && (item.msg.id === id || (item.album?.some((p) => p.id === id) ?? false));
