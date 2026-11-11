import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDebouncedValue } from "../../shared/use-debounced-value";

export type ForwardTab = "recent" | "group" | "friend";
const PAGE = 50;

/**
 * Danh sách hội thoại của hộp Chia sẻ theo tab (Gần đây / Nhóm / Bạn bè) + ô tìm, tải thêm khi cuộn xuống. `onlyIds`: chỉ
 * các hội thoại này (đang trình chiếu, hoặc tab "Đã chọn" của hộp chọn hội thoại trình chiếu); mảng rỗng = không có gì.
 */
export function useForwardTargetList(tab: ForwardTab, query: string, onlyIds: readonly string[] | null = null) {
  const q = useDebouncedValue(query.trim(), 250);
  const idsKey = onlyIds ? onlyIds.join(",") : null;
  const [items, setItems] = useState<ThreadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Đổi tab / chữ tìm thì bỏ kết quả của lần hỏi cũ còn đang về
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (offset: number) => {
      const gen = generation.current;
      setLoading(true);
      setError(null);
      try {
        if (idsKey === "") {
          setItems([]);
          setTotal(0);
          return;
        }
        const r = await api.threads({ query: q || undefined, limit: PAGE, offset, kind: tab === "recent" ? undefined : tab, ids: idsKey ?? undefined });
        if (gen !== generation.current) return;
        setItems((cur) => (offset === 0 ? r.threads : [...cur, ...r.threads]));
        setTotal(r.total);
      } catch (err) {
        if (gen === generation.current) setError(errorText(err));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [q, tab, idsKey],
  );

  useEffect(() => {
    generation.current++;
    setItems([]);
    void fetchPage(0);
  }, [fetchPage]);

  return { items, loading, error, hasMore: items.length < total, loadMore: () => void fetchPage(items.length) };
}
