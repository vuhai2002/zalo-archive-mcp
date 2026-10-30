import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult, ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconSearch } from "../../shared/dashboard-icons";
import { EmptyState, ErrorNote, formatNumber, LoadingText } from "../../shared/ui-bits";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import { ThreadListRow } from "./thread-list-row";
import { rememberRecentThread, type RecentThread } from "./recent-search-threads";
import { SEARCH_TABS, ThreadSearchResults, type SearchTab } from "./thread-search-results";
import { setThreadPinned, useOnThreadsChanged } from "./thread-pin-actions";
import { useThreadListLiveRefresh } from "./use-thread-list-live-refresh";

const PAGE_SIZE = 50;

/**
 * Cột danh sách hội thoại kiểu Zalo PC. Ô tìm kiếm nằm ngay trên đầu: bấm vào là sang chế độ tìm
 * (nút "Đóng"; chưa gõ thì "Tìm gần đây" + "Lọc tin nhắn", gõ rồi thì các tab Tất cả / Liên hệ / Tin
 * nhắn / File), không có trang tìm kiếm riêng. Tìm trong MỘT hội thoại nằm ở bảng bên phải khung chat.
 */
export function ThreadListPanel({
  selectedId,
  onSelect,
  onOpenMessage,
}: {
  selectedId?: string;
  onSelect: (threadId: string) => void;
  /** Mở hội thoại và nhảy tới một tin (bấm kết quả tìm) */
  onOpenMessage: (threadId: string, messageId: number) => void;
}) {
  const tz = useArchiveTimeZone();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [tab, setTab] = useState<SearchTab>("all");
  const searching = searchOpen;
  const debounced = useDebouncedValue(query.trim(), 300);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Chỉ nhận kết quả của lần hỏi mới nhất - gõ nhanh thì kết quả cũ về sau không được đè
  const seq = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const my = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const r = await api.threads({ query: debounced, limit: PAGE_SIZE, offset });
        if (my !== seq.current) return;
        setThreads((cur) => (offset === 0 ? r.threads : [...cur, ...r.threads.filter((t) => !cur.some((c) => c.threadId === t.threadId))]));
        setTotal(r.total);
      } catch (err) {
        if (my === seq.current) setError(errorText(err));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [debounced],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // Ghim / bỏ ghim (ở dòng này hay ở bảng thông tin) thì tải lại thứ tự từ đầu
  const reload = useCallback(() => void load(0), [load]);
  useOnThreadsChanged(reload);

  // Tin mới tới (SSE): tải lại lặng lẽ phần đầu danh sách (đang tìm kiếm thì thôi)
  useThreadListLiveRefresh({
    query: debounced,
    shown: threads.length,
    paused: searching,
    seq,
    apply: (r) => {
      setThreads(r.threads);
      setTotal(r.total);
    },
  });
  const closeSearch = () => {
    setQuery("");
    setSearchOpen(false);
    setTab("all");
  };
  // Mở từ kết quả tìm: nhớ vào "Tìm gần đây"
  const openFromSearch = (r: RecentThread) => {
    rememberRecentThread({ threadId: r.threadId, threadType: r.threadType, name: r.name, avatarUrl: r.avatarUrl });
    onSelect(r.threadId);
  };
  const openMessage = (m: SearchResult) => {
    rememberRecentThread({ threadId: m.threadId, threadType: m.threadType, name: m.threadName, avatarUrl: m.threadAvatarUrl });
    onOpenMessage(m.threadId, m.id);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({
    sentinel: moreRef,
    root: scrollRef,
    enabled: !searching && !error && threads.length > 0 && threads.length < total,
    busy: loading,
    onLoadMore: () => void load(threads.length),
  });
  const togglePin = (t: ThreadListItem) => {
    setThreadPinned(t.threadId, !t.pinned).catch((err: unknown) => setError(errorText(err)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="border-b border-line px-4 pt-3">
        {!searching && (
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h1 className="text-[16px] font-semibold text-ink">
              Hội thoại <span className="text-[13px] font-medium text-ink-soft">({formatNumber(total)})</span>
            </h1>
          </div>
        )}
        <div className={`flex items-center gap-2 ${searching && query.trim() !== "" ? "" : "pb-3"}`}>
          <div className="relative min-w-0 flex-1">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder="Tìm kiếm"
              aria-label="Tìm kiếm"
              className="gc-input w-full py-1.5 pl-9"
            />
          </div>
          {searching && (
            <button type="button" onClick={closeSearch} className="shrink-0 rounded-md px-2 py-1.5 text-[14px] font-semibold text-ink hover:bg-tile">
              Đóng
            </button>
          )}
        </div>
        {searching && query.trim() !== "" && (
          <div className="mt-2 flex gap-4">
            {SEARCH_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`border-b-2 pb-2 text-[14px] font-medium ${
                  tab === t.id ? "border-zalo-500 text-zalo-500" : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-stable min-h-0 flex-1 overflow-y-auto">
        {searching ? (
          <ThreadSearchResults
            query={debounced}
            tab={tab}
            onTab={setTab}
            contacts={debounced ? threads : []}
            timeZone={tz}
            onOpenThread={openFromSearch}
            onOpenMessage={openMessage}
          />
        ) : (
          <>
        {error && (
          <div className="p-3">
            <ErrorNote message={error} onRetry={() => void load(threads.length)} />
          </div>
        )}
        {!loading && !error && threads.length === 0 && (
          <EmptyState text={debounced ? "Không có hội thoại nào khớp." : "Kho chưa có hội thoại nào."} />
        )}
        <ul>
          {threads.map((t) => (
            <li key={t.threadId}>
              <ThreadListRow t={t} active={t.threadId === selectedId} timeZone={tz} onSelect={onSelect} onTogglePin={togglePin} />
            </li>
          ))}
        </ul>
        {/* Cuộn gần tới đáy là tự tải trang tiếp, như Zalo */}
        <div ref={moreRef} aria-hidden="true" className="h-px" />
        {loading && <LoadingText />}
          </>
        )}
      </div>
    </div>
  );
}
