import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { IconSearch } from "../../shared/dashboard-icons";
import { BTN_ICON, EmptyState, ErrorNote, formatNumber, LoadingText } from "../../shared/ui-bits";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import { ThreadListRow } from "./thread-list-row";

const PAGE_SIZE = 50;

export function ThreadListPanel({ selectedId, onSelect }: { selectedId?: string; onSelect: (threadId: string) => void }) {
  const tz = useArchiveTimeZone();
  const [query, setQuery] = useState("");
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

  return (
    <div className="gc-card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[16px] font-semibold text-ink">
            Hội thoại <span className="text-[13px] font-medium text-ink-soft">({formatNumber(total)})</span>
          </h1>
          <button type="button" onClick={() => void load(0)} title="Tải lại" aria-label="Tải lại danh sách" className={BTN_ICON}>
            <IconRefresh size={17} />
          </button>
        </div>
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên..."
            aria-label="Tìm hội thoại"
            className="gc-input w-full py-1.5 pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="p-3">
            <ErrorNote message={error} onRetry={() => void load(threads.length)} />
          </div>
        )}
        {!loading && !error && threads.length === 0 && (
          <EmptyState text={debounced ? "Không có hội thoại nào khớp." : "Kho chưa có hội thoại nào."} />
        )}
        <ul className="space-y-0.5 p-2">
          {threads.map((t) => (
            <li key={t.threadId}>
              <ThreadListRow t={t} active={t.threadId === selectedId} timeZone={tz} onSelect={onSelect} />
            </li>
          ))}
        </ul>
        {loading && <LoadingText />}
        {!loading && !error && threads.length < total && (
          <div className="p-3">
            <button
              type="button"
              onClick={() => void load(threads.length)}
              className="w-full rounded-lg border border-line py-2 text-[13px] font-medium text-ink-soft hover:bg-tile hover:text-ink"
            >
              Tải thêm ({formatNumber(total - threads.length)} còn lại)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
