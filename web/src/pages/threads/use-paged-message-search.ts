import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";

export type MessageSearchParams = Omit<Parameters<typeof api.search>[0], "offset" | "limit">;

/**
 * Một danh sách kết quả tìm có phân trang ("Xem thêm"): đổi điều kiện tìm là tải lại từ đầu, kết quả
 * của lần hỏi cũ về sau không đè lần mới. `params` null = chưa tìm gì (danh sách rỗng, không gọi API).
 */
export function usePagedMessageSearch(params: MessageSearchParams | null, pageSize: number) {
  const key = params ? JSON.stringify(params) : null;
  const [items, setItems] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);
  const latest = useRef(params);
  latest.current = params;

  useEffect(() => {
    const my = ++seq.current;
    setError(null);
    setHasMore(false);
    setLoadingMore(false);
    const p = latest.current;
    if (!p) return setItems([]);
    setItems(null);
    api
      .search({ ...p, offset: 0, limit: pageSize })
      .then((r) => {
        if (my !== seq.current) return;
        setItems(r.messages);
        setHasMore(r.messages.length >= pageSize);
      })
      .catch((err: unknown) => my === seq.current && setError(errorText(err)));
  }, [key, pageSize]);

  const loadMore = useCallback(() => {
    const p = latest.current;
    if (!p || !items || loadingMore) return;
    const my = seq.current;
    setLoadingMore(true);
    api
      .search({ ...p, offset: items.length, limit: pageSize })
      .then((r) => {
        if (my !== seq.current) return;
        setItems((cur) => {
          const have = new Set((cur ?? []).map((m) => m.id));
          return [...(cur ?? []), ...r.messages.filter((m) => !have.has(m.id))];
        });
        setHasMore(r.messages.length >= pageSize);
      })
      .catch((err: unknown) => my === seq.current && setError(errorText(err)))
      .finally(() => my === seq.current && setLoadingMore(false));
  }, [items, loadingMore, pageSize]);

  return { items, error, hasMore, loadingMore, loadMore };
}
