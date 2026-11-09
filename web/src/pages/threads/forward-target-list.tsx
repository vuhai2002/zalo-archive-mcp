import { useRef } from "react";
import type { ThreadListItem } from "../../archive-api-types";
import { IconCheck } from "../../shared/dashboard-icons";
import { ThreadAvatar } from "../../shared/thread-avatar";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import type { useForwardTargetList } from "./use-forward-target-list";

/** Cột trái hộp Chia sẻ: hội thoại có ô chọn như Zalo; đủ trần thì các ô chưa chọn bị khóa */
export function ForwardTargetList({
  list,
  isChosen,
  full,
  onToggle,
}: {
  list: ReturnType<typeof useForwardTargetList>;
  isChosen: (threadId: string) => boolean;
  full: boolean;
  onToggle: (t: ThreadListItem) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({ sentinel, root: scroll, enabled: list.hasMore && !list.error, busy: list.loading, onLoadMore: list.loadMore });

  return (
    <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto py-1">
      {list.items.map((t) => {
        const chosen = isChosen(t.threadId);
        const locked = full && !chosen;
        return (
          <button
            key={`${t.threadType}:${t.threadId}`}
            type="button"
            role="checkbox"
            aria-checked={chosen}
            disabled={locked}
            onClick={() => onToggle(t)}
            title={locked ? "Đã chọn đủ 100 hội thoại" : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-tile disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${chosen ? "border-zalo-500 bg-zalo-500 text-white" : "border-line bg-surface"}`}
            >
              {chosen && <IconCheck size={12} strokeWidth={3} />}
            </span>
            <ThreadAvatar t={t} />
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{threadDisplayName(t.name)}</span>
          </button>
        );
      })}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {list.loading && <p className="py-2 text-center text-[12px] text-ink-soft">Đang tải...</p>}
      {list.error && <p className="py-2 text-center text-[12px] text-red-600 dark:text-red-400">{list.error}</p>}
      {!list.loading && !list.error && list.items.length === 0 && <p className="py-6 text-center text-[13px] text-ink-soft">Không có hội thoại nào.</p>}
    </div>
  );
}
