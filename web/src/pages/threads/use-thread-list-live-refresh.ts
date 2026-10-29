import { useRef, type MutableRefObject } from "react";
import type { ThreadListResponse } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { useArchiveLiveChanges } from "../../shared/use-archive-live-changes";

/** Gom các báo "có tin mới" tới dồn dập thành một lần tải lại */
const LIVE_DEBOUNCE_MS = 500;
const MIN_ROWS = 50;
const MAX_ROWS = 200;

/**
 * Tin mới tới (SSE): tải lại lặng lẽ phần đầu danh sách hội thoại - không hiện "Đang tải", giữ đủ
 * số dòng đang hiện để khỏi nhảy chỗ cuộn. `seq` dùng chung với lần tải thường của danh sách: kết
 * quả cũ về sau không đè kết quả mới.
 */
export function useThreadListLiveRefresh(o: {
  query: string;
  shown: number;
  paused: boolean;
  seq: MutableRefObject<number>;
  apply: (r: ThreadListResponse) => void;
}): void {
  const latest = useRef(o);
  latest.current = o;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useArchiveLiveChanges(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { query, shown, paused, seq, apply } = latest.current;
      if (paused) return;
      const my = ++seq.current;
      api
        .threads({ query, limit: Math.min(MAX_ROWS, Math.max(MIN_ROWS, shown)), offset: 0 })
        .then((r) => my === seq.current && apply(r))
        .catch(() => undefined);
    }, LIVE_DEBOUNCE_MS);
  });
}
