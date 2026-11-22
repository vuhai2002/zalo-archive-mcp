import { useEffect, useState } from "react";
import type { SearchFilter, SearchResult } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { useActiveAccountId } from "../../layout/dashboard-shell-context";
import { IconArrowLeft, IconClose } from "../../shared/dashboard-icons";
import { ErrorNote, LoadingText } from "../../shared/ui-bits";
import {
  forgetRecentThread,
  loadRecentThreads,
  needsMemberAvatars,
  recentThreadOf,
  updateRecentThread,
  type RecentThread,
} from "./recent-search-threads";
import { ContactHitRow, MessageHitRow, WideButton } from "./search-hit-rows";
import { usePagedMessageSearch } from "./use-paged-message-search";

const FILTERS: Array<{ id: SearchFilter; label: string; empty: string }> = [
  { id: "mentions", label: "Nhắc bạn", empty: "Chưa có tin nào nhắc tới bạn." },
  { id: "reactions", label: "Biểu cảm", empty: "Chưa có tin nào của bạn được thả cảm xúc." },
];

/**
 * Ô tìm chung đang mở mà chưa gõ gì, như Zalo: "Tìm gần đây" (hội thoại vừa mở từ ô tìm) và "Lọc tin
 * nhắn" - Nhắc bạn (tin người khác @bạn / @Tất cả), Biểu cảm (tin của bạn được người khác thả cảm xúc).
 */
export function SearchStartPanel({
  timeZone,
  onOpenThread,
  onOpenMessage,
}: {
  timeZone: string;
  onOpenThread: (r: RecentThread) => void;
  onOpenMessage: (m: SearchResult) => void;
}) {
  const accountId = useActiveAccountId();
  const [recent, setRecent] = useState(() => loadRecentThreads(accountId));
  const [filter, setFilter] = useState<SearchFilter | null>(null);

  // Mục nhóm không có ảnh riêng lưu từ bản cũ: lấy lại thành viên để ghép avatar như danh sách hội thoại (lỗi thì để lần sau)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const r of loadRecentThreads(accountId).filter(needsMemberAvatars)) {
        try {
          const t = (await api.threads({ query: r.threadId, limit: 1, offset: 0 })).threads.find((x) => x.threadId === r.threadId);
          if (t && !cancelled) setRecent(updateRecentThread(accountId, recentThreadOf(t)));
        } catch {
          // Mạng / kho lỗi: giữ chữ viết tắt, lần mở bảng sau thử lại
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  const list = usePagedMessageSearch(filter ? { filter } : null, 30);
  const active = FILTERS.find((f) => f.id === filter);

  if (active) {
    return (
      <div>
        <button type="button" onClick={() => setFilter(null)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] font-semibold text-ink hover:bg-tile/70">
          <IconArrowLeft size={17} /> {active.label}
        </button>
        {list.error && <div className="px-4"><ErrorNote message={list.error} /></div>}
        {list.items === null && !list.error && <LoadingText />}
        {list.items?.length === 0 && <p className="px-4 py-6 text-center text-[13.5px] text-ink-soft">{active.empty}</p>}
        <ul>
          {list.items?.map((m) => <MessageHitRow key={m.id} m={m} query="" timeZone={timeZone} onClick={() => onOpenMessage(m)} />)}
        </ul>
        {list.hasMore && <WideButton label="Xem thêm" onClick={list.loadMore} busy={list.loadingMore} />}
      </div>
    );
  }

  return (
    <div>
      <h4 className="px-4 pb-1 pt-3 text-[14.5px] font-semibold text-ink">Tìm gần đây</h4>
      {recent.length === 0 && <p className="px-4 pb-3 text-[13px] text-ink-soft">Chưa có hội thoại nào mở từ ô tìm kiếm.</p>}
      <ul>
        {recent.map((r) => (
          <ContactHitRow
            key={r.threadId}
            t={r}
            query=""
            onClick={() => onOpenThread(r)}
            trailing={
              <button
                type="button"
                onClick={() => setRecent(forgetRecentThread(accountId, r.threadId))}
                aria-label="Xóa khỏi tìm gần đây"
                title="Xóa khỏi tìm gần đây"
                className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full p-1 text-ink-soft hover:bg-line hover:text-ink group-hover:block"
              >
                <IconClose size={14} />
              </button>
            }
          />
        ))}
      </ul>
      <div className="mx-4 mt-1 border-t border-line pt-3">
        <h4 className="text-[14.5px] font-semibold text-ink">Lọc tin nhắn</h4>
        <div className="mt-2 flex flex-wrap gap-2 pb-4">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className="rounded-full bg-tile px-3.5 py-1.5 text-[14px] text-ink hover:bg-line">
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
