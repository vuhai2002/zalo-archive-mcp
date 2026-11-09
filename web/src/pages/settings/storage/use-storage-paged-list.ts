import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "../../../dashboard-api-client";

/**
 * Danh sách tải theo trang cho mục Quản lý dữ liệu (hội thoại theo dung lượng, lưới file): `fetchPage(offset)` đổi (tab, sắp xếp,
 * chữ tìm...) thì tải lại từ đầu; cuộn xuống gọi `loadMore`. Bỏ kết quả của lần hỏi cũ còn đang về.
 */
export function useStoragePagedList<T, R extends { items: T[]; total: number }>(fetchPage: (offset: number) => Promise<R>) {
  const [items, setItems] = useState<T[]>([]);
  const [last, setLast] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const gen = offset === 0 ? ++generation.current : generation.current;
      setLoading(true);
      setError(null);
      try {
        const r = await fetchPage(offset);
        if (gen !== generation.current) return;
        setItems((cur) => (offset === 0 ? r.items : [...cur, ...r.items]));
        setLast(r);
      } catch (err) {
        if (gen === generation.current) setError(errorText(err));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    setItems([]);
    void load(0);
  }, [load]);

  return {
    items,
    last,
    loading,
    error,
    hasMore: last !== null && items.length < last.total,
    loadMore: () => void load(items.length),
    reload: () => void load(0),
  };
}
