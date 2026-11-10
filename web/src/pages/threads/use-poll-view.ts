import { useCallback, useEffect, useState } from "react";
import type { PollView } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";

const PENDING_RETRY_MS = 5_000;
const PENDING_MAX_TRIES = 12;

/**
 * Chi tiết một cuộc bình chọn cho thẻ / cửa sổ Xem. Daemon chưa lấy xong (`pending`, vd vừa có người bình chọn) thì hỏi lại
 * mỗi 5 giây, tối đa một phút - daemon chờ các lượt lắng 20 giây rồi mới hỏi Zalo.
 */
export function usePollView(pollId: string) {
  const [view, setView] = useState<PollView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  const load = useCallback(() => {
    api
      .poll(pollId)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, [pollId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (view?.status !== "pending" || tries >= PENDING_MAX_TRIES) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      load();
    }, PENDING_RETRY_MS);
    return () => clearTimeout(timer);
  }, [view, tries, load]);

  return { view, error, reload: load };
}
