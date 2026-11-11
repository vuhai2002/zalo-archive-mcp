import { Fragment, useMemo, useState } from "react";
import { ChatItemRow, itemHasMessage, rowSelection } from "./chat-item-row";
import type { MessageLayout } from "./message-grouping";
import type { ChatItem } from "./photo-album-grouping";
import { PollCard } from "./poll-card";
import { foldablePollRuns, pollCardAnchors, type PollRunRole } from "./poll-notice-runs";
import type { MessageActions } from "./message-action-rules";

/**
 * Danh sách tin của khung chat. Thẻ bình chọn nằm dưới dòng mới nhất của mỗi cuộc bình chọn, như Zalo PC (người bình chọn
 * sau thì thẻ dời xuống). Nhiều dòng bình chọn liền nhau (người này người kia lần lượt bình chọn) gộp như Zalo PC: chỉ
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
  const anchors = useMemo(() => pollCardAnchors(p.items.map((x) => x.msg)), [p.items]);
  const [openRuns, setOpenRuns] = useState<ReadonlySet<number>>(new Set());
  const highlightRun = p.highlightId === null ? null : (runs.get(p.highlightId)?.runStart ?? null);
  const isFolded = (run: PollRunRole | undefined): run is PollRunRole => !!run && !openRuns.has(run.runStart) && run.runStart !== highlightRun;

  // Thẻ bình chọn đặt dưới dòng mới nhất của mỗi cuộc; dòng đó đang bị gộp ("Xem thêm") thì đặt dưới dòng cuối của chuỗi
  const cardsAfter = new Map<number, string[]>();
  const runLast = new Map([...runs].filter(([, r]) => r.role === "last").map(([id, r]) => [r.runStart, id]));
  for (const { msg } of p.items) {
    if (!anchors.has(msg.id) || !msg.poll) continue;
    const run = runs.get(msg.id);
    const at = isFolded(run) && run.role === "hidden" ? (runLast.get(run.runStart) ?? msg.id) : msg.id;
    cardsAfter.set(at, [...(cardsAfter.get(at) ?? []), msg.poll.pollId]);
  }

  return p.items.map((item, i) => {
    const run = runs.get(item.msg.id);
    const folded = isFolded(run);
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
        {cardsAfter.get(item.msg.id)?.map((pollId) => <PollCard key={pollId} pollId={pollId} />)}
      </Fragment>
    );
  });
}
