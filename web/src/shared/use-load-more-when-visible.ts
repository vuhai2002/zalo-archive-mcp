import { useEffect, useRef, type RefObject } from "react";

/**
 * Tự tải thêm khi cuộn tới, như Zalo (không có nút "Tải thêm"): đặt một mốc rỗng ở cuối danh sách
 * (hoặc đầu khung chat với tin cũ), mốc lọt vào vùng nhìn thấy - kể cả hơi sớm, `marginPx` - thì gọi
 * `onLoadMore`. Dựng lại bộ theo dõi mỗi khi `busy` đổi: tải xong mà mốc vẫn còn trong tầm nhìn
 * (trang chưa đầy màn hình) thì tải tiếp ngay, không đứng chờ người dùng cuộn.
 */
export function useLoadMoreWhenVisible(opts: {
  sentinel: RefObject<HTMLElement | null>;
  root?: RefObject<HTMLElement | null>;
  enabled: boolean;
  busy: boolean;
  onLoadMore: () => void;
  marginPx?: number;
}): void {
  const { sentinel, root, enabled, busy, marginPx = 300 } = opts;
  const load = useRef(opts.onLoadMore);
  load.current = opts.onLoadMore;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !enabled || busy) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load.current();
      },
      { root: root?.current ?? null, rootMargin: `${marginPx}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sentinel, root, enabled, busy, marginPx]);
}
