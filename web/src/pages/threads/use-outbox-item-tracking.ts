import { useCallback, useEffect, useRef, useState } from "react";
import type { OutboxItem, OutboxStatus } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";

const POLL_MS = 1_500;
const GIVE_UP_MS = 60_000;
const FINAL = new Set<OutboxStatus>(["sent", "failed", "cancelled", "rejected"]);

/**
 * Theo dõi một mục hàng đợi vừa tạo bằng "Gửi ngay": hỏi `GET /api/outbox/:id`
 * mỗi 1,5 giây tới khi có kết quả cuối, tối đa ~60 giây. Quá hạn thì thôi hỏi
 * nhưng KHÔNG coi là lỗi - daemon có thể đang chờ nhịp gửi, kết quả vẫn xem
 * được ở trang Hàng đợi.
 */
export function useOutboxItemTracking(onSent: () => void) {
  const [item, setItem] = useState<OutboxItem | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  const stop = useCallback(() => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => stop, [stop]);

  const track = useCallback(
    (first: OutboxItem) => {
      stop();
      const myRun = run.current;
      const startedAt = Date.now();
      setItem(first);
      setTimedOut(false);
      if (FINAL.has(first.status)) return;

      const poll = async () => {
        try {
          const next = await api.outboxGet(first.id);
          if (myRun !== run.current) return;
          setItem(next);
          if (FINAL.has(next.status)) {
            if (next.status === "sent") onSentRef.current();
            return;
          }
        } catch {
          // Lỗi mạng một lượt: hỏi tiếp lượt sau, không bỏ dở việc theo dõi
          if (myRun !== run.current) return;
        }
        if (Date.now() - startedAt >= GIVE_UP_MS) {
          setTimedOut(true);
          return;
        }
        timer.current = setTimeout(poll, POLL_MS);
      };
      timer.current = setTimeout(poll, POLL_MS);
    },
    [stop],
  );

  /** Ghi một mục không cần theo dõi (nháp, hẹn giờ) để dòng trạng thái hiện kết quả */
  const show = useCallback(
    (it: OutboxItem) => {
      stop();
      setItem(it);
      setTimedOut(false);
    },
    [stop],
  );

  const clear = useCallback(() => {
    stop();
    setItem(null);
    setTimedOut(false);
  }, [stop]);

  return { item, timedOut, track, show, clear };
}
