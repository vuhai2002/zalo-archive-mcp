import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SearchResult, ThreadSummary } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconSearch } from "../../shared/dashboard-icons";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { SearchFilterForm, type SearchFilters } from "./search-filter-form";
import { SearchResultCard } from "./search-result-card";

const RESULT_LIMIT = 50;
/** Số hội thoại nạp cho ô chọn + để tra tên hội thoại cho kết quả (kết quả tìm không kèm tên) */
const THREAD_PICKER_LIMIT = 100;

/**
 * Trang Tìm kiếm. Bộ lọc nằm trên URL (`?q=&threadId=&fromDate=&toDate=`) để
 * link "Tìm trong hội thoại này" mở thẳng được, và nút Back quay về đúng kết quả.
 */
export function SearchPage() {
  const tz = useArchiveTimeZone();
  const [params, setParams] = useSearchParams();
  const filters = useMemo<SearchFilters>(
    () => ({
      q: params.get("q") ?? "",
      threadId: params.get("threadId") ?? "",
      fromDate: params.get("fromDate") ?? "",
      toDate: params.get("toDate") ?? "",
    }),
    [params],
  );
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    api
      .threads({ limit: THREAD_PICKER_LIMIT, offset: 0 })
      .then((r) => setThreads(r.threads))
      .catch(() => setThreads([]));
  }, []);

  useEffect(() => {
    if (!filters.q) {
      setResults(null);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    api
      .search({ ...filters, limit: RESULT_LIMIT })
      .then((r) => my === seq.current && setResults(r.messages))
      .catch((err: unknown) => my === seq.current && setError(errorText(err)))
      .finally(() => my === seq.current && setLoading(false));
  }, [filters]);

  const threadById = useMemo(() => new Map(threads.map((t) => [t.threadId, t] as const)), [threads]);

  function submit(f: SearchFilters) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) next.set(k, v);
    setParams(next);
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={IconSearch} title="Tìm kiếm" subtitle="Tìm trong toàn bộ tin đã lưu, mới nhất trước" />
      <SearchFilterForm value={filters} threads={threads} onSubmit={submit} />

      {error && <ErrorNote message={error} />}
      {loading && <LoadingText text="Đang tìm..." />}
      {!loading && !error && results !== null && results.length === 0 && <EmptyState text="Không có tin nào khớp." />}
      {!loading && results && results.length > 0 && (
        <>
          <p className="text-[13px] text-ink-soft">
            {results.length >= RESULT_LIMIT
              ? `Hiện ${RESULT_LIMIT} kết quả mới nhất - thu hẹp theo hội thoại hoặc ngày để xem tin cũ hơn.`
              : `${results.length} kết quả.`}
          </p>
          <ul className="space-y-3">
            {results.map((m) => (
              <SearchResultCard key={m.id} msg={m} thread={threadById.get(m.threadId)} query={filters.q} timeZone={tz} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
