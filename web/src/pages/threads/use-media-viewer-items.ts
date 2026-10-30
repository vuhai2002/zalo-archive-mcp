import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../dashboard-api-client";
import { insertByTime, viewerItemFromShared, type ViewerItem } from "./media-viewer-items";

const FIRST_PAGE = 60;
const PAGE = 120;
/** Tìm ảnh vừa bấm trong tối đa chừng này trang; không thấy thì chèn riêng nó vào đúng chỗ */
const MAX_SEEK_PAGES = 5;

/**
 * Ảnh / video của cả hội thoại cho cửa sổ xem (dải bên phải, lên / xuống), cũ trước như Zalo. Máy chủ
 * trả mới nhất trước theo trang; kéo dải lên đầu thì tải tiếp phần cũ hơn. Ảnh vừa bấm luôn có trong
 * danh sách, kể cả khi nằm xa ngoài các trang đã tải.
 */
export function useMediaViewerItems(threadId: string, start: ViewerItem) {
  const [items, setItems] = useState<ViewerItem[]>([start]);
  const [total, setTotal] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Số mục máy chủ đã trả (khác `items.length`: có thể đã chèn riêng ảnh vừa bấm)
  const fetched = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const fetchPage = useCallback(
    async (limit: number) => {
      const r = await api.threadShared(threadId, { kind: "visual", limit, offset: fetched.current });
      fetched.current += r.items.length;
      setTotal(r.total);
      const page = r.items.map(viewerItemFromShared).filter((x): x is ViewerItem => x !== null).reverse();
      return { page, exhausted: r.items.length < limit || fetched.current >= r.total };
    },
    [threadId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: ViewerItem[] = [];
      for (let n = 0; n < MAX_SEEK_PAGES; n++) {
        const { page, exhausted } = await fetchPage(n === 0 ? FIRST_PAGE : PAGE).catch(() => ({ page: [], exhausted: true }));
        list = [...page, ...list];
        if (exhausted || list.some((x) => x.id === start.id)) break;
      }
      if (!cancelled && alive.current) setItems(insertByTime(list, start));
    })();
    return () => {
      cancelled = true;
    };
    // Chỉ chạy lần mở (`start` cố định suốt đời cửa sổ xem): đổi ảnh đang xem không tải lại danh sách
  }, [fetchPage]);

  const loadOlder = useCallback(() => {
    if (loadingOlder || fetched.current >= total) return;
    setLoadingOlder(true);
    fetchPage(PAGE)
      .then(({ page }) => alive.current && setItems((cur) => page.reduce((acc, x) => insertByTime(acc, x), cur)))
      .catch(() => undefined)
      .finally(() => alive.current && setLoadingOlder(false));
  }, [fetchPage, loadingOlder, total]);

  return { items, hasOlder: fetched.current < total, loadingOlder, loadOlder };
}
