import type { KeyboardEvent } from "react";
import { IconCheck } from "../../shared/dashboard-icons";
import type { MessageActions } from "./message-action-rules";
import { MessageBubble } from "./message-bubble";
import type { MessageLayout } from "./message-grouping";
import type { ChatItem } from "./photo-album-grouping";

/** Đang ở chế độ Chọn nhiều tin nhắn: mục này đã chọn chưa + bấm để chọn / bỏ */
export type RowSelection = { selected: boolean; onToggle: () => void };

/**
 * Một mục trong khung chat: vạch giờ (nếu có) rồi bong bóng tin / khung album. Mục được bọc trong
 * phần tử mang `data-msg-ids` (id tin, cùng id các ảnh của album) để nhảy tới tin từ kết quả tìm, và
 * tô nền một lúc khi đó là tin vừa nhảy tới. Đang chọn nhiều tin: ô tròn bên trái, bấm cả dòng để chọn như Zalo.
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
  actions,
  selection,
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
  /** Thao tác khi rê chuột vào tin; bỏ trống khi đang chọn nhiều tin */
  actions?: MessageActions;
  selection?: RowSelection;
}) {
  const bubble = (
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
      actions={selection ? undefined : actions}
    />
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    selection?.onToggle();
  };
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
        {selection ? (
          <div
            role="checkbox"
            aria-checked={selection.selected}
            aria-label="Chọn tin này"
            tabIndex={0}
            onClick={selection.onToggle}
            onKeyDown={onKey}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-1 ${selection.selected ? "bg-zalo-500/10" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selection.selected ? "border-zalo-500 bg-zalo-500 text-white" : "border-ink-soft/50 bg-surface"
              }`}
            >
              {selection.selected && <IconCheck size={12} strokeWidth={3} />}
            </span>
            {/* Bấm vào ảnh / link khi đang chọn chỉ để chọn tin, không mở */}
            <div className="pointer-events-none min-w-0 flex-1">{bubble}</div>
          </div>
        ) : (
          bubble
        )}
      </div>
    </>
  );
}

/** Mục có chứa tin này không (chính nó, hoặc một ảnh trong album) */
export const itemHasMessage = (item: ChatItem, id: number | null) =>
  id !== null && (item.msg.id === id || (item.album?.some((p) => p.id === id) ?? false));

/** Đang chọn nhiều tin: mục đã chọn khi mọi tin của nó (album: mọi ảnh) đã chọn; bấm thì chọn / bỏ cả mục */
export function rowSelection(selected: ReadonlySet<number>, item: ChatItem, toggle: (ids: number[]) => void): RowSelection {
  const ids = item.album ? item.album.map((p) => p.id) : [item.msg.id];
  return { selected: ids.every((id) => selected.has(id)), onToggle: () => toggle(ids) };
}
