import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { usePresentationMode } from "../../layout/presentation-mode-context";
import { IconPlus, IconPresentation, IconSearch } from "../../shared/dashboard-icons";
import { canSearchToAdd, MAX_ADD_SEARCH_RESULTS, MIN_ADD_SEARCH_CHARS } from "../../shared/presentation-mode-state";
import { ThreadAvatar } from "../../shared/thread-avatar";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { ErrorNote, LoadingText } from "../../shared/ui-bits";
import { useArchiveLiveChanges } from "../../shared/use-archive-live-changes";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import { setThreadPinned, useOnThreadsChanged } from "./thread-pin-actions";
import { ThreadListRow } from "./thread-list-row";

/**
 * Cột danh sách lúc đang trình chiếu (chia sẻ màn hình): chỉ các hội thoại chọn sẵn, dải vàng "Đang trình chiếu" + nút Thoát.
 * Ô tìm KHÔNG tìm tin nhắn; nó chỉ để thêm hội thoại khác khi gặp tình huống bất ngờ: gõ từ 3 chữ mới hỏi kho, kết quả chỉ có
 * tên (không dòng tin cuối), tối đa 5; bấm là thêm vào danh sách và mở luôn.
 */
export function PresentationThreadListPanel({ selectedId, onSelect }: { selectedId?: string; onSelect: (threadId: string) => void }) {
  const tz = useArchiveTimeZone();
  const p = usePresentationMode();
  const idsKey = p.threadIds.join(",");
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 250);
  const [hits, setHits] = useState<ThreadListItem[] | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (quiet: boolean) => {
      const my = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const r = await api.threads({ ids: idsKey, limit: 200, offset: 0 });
        if (my !== seq.current) return;
        setThreads(r.threads);
        setError(null);
      } catch (err) {
        if (my === seq.current) setError(errorText(err));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [idsKey],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  // Tin mới tới / ghim: tải lại lặng lẽ, thứ tự theo tin mới nhất như danh sách thường
  useArchiveLiveChanges(() => void load(true));
  useOnThreadsChanged(useCallback(() => void load(true), [load]));

  useEffect(() => {
    if (!canSearchToAdd(q)) return setHits(null);
    let cancelled = false;
    api.threads({ query: q, limit: MAX_ADD_SEARCH_RESULTS + p.threadIds.length, offset: 0 }).then(
      (r) => !cancelled && setHits(r.threads.filter((t) => !p.threadIds.includes(t.threadId)).slice(0, MAX_ADD_SEARCH_RESULTS)),
      () => !cancelled && setHits([]),
    );
    return () => {
      cancelled = true;
    };
  }, [q, p.threadIds]);

  const addAndOpen = (t: ThreadListItem) => {
    p.add(t.threadId);
    setQuery("");
    onSelect(t.threadId);
  };
  const togglePin = (t: ThreadListItem) => {
    setThreadPinned(t.threadId, !t.pinned).catch((err: unknown) => setError(errorText(err)));
  };
  const typed = query.trim() !== "";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="flex items-center gap-2 bg-amber-100 px-4 py-2.5 text-[13.5px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
        <IconPresentation size={18} />
        <span className="min-w-0 flex-1 font-medium">Đang trình chiếu - {p.threadIds.length} hội thoại</span>
        <button type="button" onClick={p.requestStop} className="shrink-0 rounded-md bg-white/70 px-2.5 py-1 text-[13px] font-semibold text-amber-900 hover:bg-white dark:bg-white/10 dark:text-amber-200 dark:hover:bg-white/20">
          Thoát
        </button>
      </div>
      <div className="border-b border-line px-4 py-3">
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Tìm để thêm hội thoại khác..."
            aria-label="Tìm để thêm hội thoại vào trình chiếu"
            className="h-[34px] w-full rounded-md border border-transparent bg-tile pl-9 pr-3 text-[15px] text-ink outline-none placeholder:text-ink-soft focus:border-zalo-500 focus:bg-surface"
          />
        </div>
        {typed && !canSearchToAdd(query) && <p className="mt-2 text-[12.5px] text-ink-soft">Gõ ít nhất {MIN_ADD_SEARCH_CHARS} chữ để tìm</p>}
        {typed && canSearchToAdd(query) && hits && (
          <div className="mt-2">
            <p className="mb-1 text-[12.5px] text-ink-soft">{hits.length > 0 ? "Bấm để thêm vào trình chiếu" : "Không thấy hội thoại nào"}</p>
            {hits.map((t) => (
              <button key={t.threadId} type="button" onClick={() => addAndOpen(t)} className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-tile">
                <ThreadAvatar t={t} />
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{threadDisplayName(t.name)}</span>
                <IconPlus size={18} className="shrink-0 text-zalo-500" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="p-3">
            <ErrorNote message={error} onRetry={() => void load(false)} />
          </div>
        )}
        <ul>
          {threads.map((t) => (
            <li key={t.threadId}>
              <ThreadListRow t={t} active={t.threadId === selectedId} timeZone={tz} onSelect={onSelect} onTogglePin={togglePin} />
            </li>
          ))}
        </ul>
        {loading && <LoadingText />}
      </div>
    </div>
  );
}
