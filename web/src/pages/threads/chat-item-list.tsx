import { Fragment, useMemo, useState } from "react";
import { ChatItemRow, itemHasMessage, rowSelection } from "./chat-item-row";
import type { MessageLayout } from "./message-grouping";
import type { ChatItem } from "./photo-album-grouping";
import { foldablePollRuns } from "./poll-notice-runs";
import type { MessageActions } from "./message-action-rules";

/**
 * Danh sách tin của khung chat. Nhiều dòng bình chọn liền nhau (người này người kia lần lượt bình chọn) gộp như Zalo PC: chỉ
 * hiện dòng mới nhất, phía trên là "Xem thêm" để mở các dòng còn lại. Chuỗi đang chứa tin được nhảy tới (bấm kết quả tìm) thì
 * tự mở.
 */
export function ChatItemList(p: {
  items: ChatItem[];
  layouts: MessageLayout[];
  highlightId: number | null;
  isGroup: boolean;
  timeZone: string;
  onMediaLoad: () => void;
  onMediaRetried: () => void;
  onJumpToMessage: (id: number) => void;
  actions?: MessageActions;
  selected: ReadonlySet<number> | null;
  toggle: (ids: number[]) => void;
}) {
  const runs = useMemo(() => foldablePollRuns(p.items.map((x) => x.msg)), [p.items]);
  const [openRuns, setOpenRuns] = useState<ReadonlySet<number>>(new Set());
  const highlightRun = p.highlightId === null ? null : (runs.get(p.highlightId)?.runStart ?? null);

  return p.items.map((item, i) => {
    const run = runs.get(item.msg.id);
    const folded = run && !openRuns.has(run.runStart) && run.runStart !== highlightRun;
    if (folded && run.role === "hidden") return null;
    return (
      <Fragment key={item.msg.id}>
        {folded && (
          <div className="my-2 flex justify-center">
            <button
              type="button"
              onClick={() => setOpenRuns((s) => new Set(s).add(run.runStart))}
              className="rounded-full bg-bubble px-3.5 py-1 text-[13px] font-medium text-zalo-600 shadow-sm hover:bg-tile dark:text-zalo-500"
            >
              Xem thêm ({run.hiddenCount})
            </button>
          </div>
        )}
        <ChatItemRow
          item={item}
          layout={p.layouts[i]!}
          highlighted={itemHasMessage(item, p.highlightId)}
          isGroup={p.isGroup}
          timeZone={p.timeZone}
          onMediaLoad={p.onMediaLoad}
          onMediaRetried={p.onMediaRetried}
          onJumpToMessage={p.onJumpToMessage}
          actions={p.actions}
          selection={p.selected ? rowSelection(p.selected, item, p.toggle) : undefined}
        />
      </Fragment>
    );
  });
}
