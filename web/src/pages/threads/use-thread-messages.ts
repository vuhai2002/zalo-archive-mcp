import { useCallback, useEffect, useRef, useState } from "react";
import type { ArchivedMessage, ThreadSummary } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";

const PAGE_SIZE = 50;

/** Ghép trang mới nhất vào danh sách đang có: giữ phần cũ hơn trang đó, thay phần trùng */
function mergeLatest(current: ArchivedMessage[], latest: ArchivedMessage[]): ArchivedMessage[] {
  const first = latest[0];
  if (!first) return current;
  const latestIds = new Set(latest.map((m) => m.id));
  const older = current.filter((m) => !latestIds.has(m.id) && m.sentAt < first.sentAt);
  return [...older, ...latest];
}

/**
 * Tin của MỘT hội thoại, phân trang lùi bằng `beforeId`. Component dùng hook
 * này được key theo threadId nên đổi hội thoại là dựng lại từ đầu, không phải
 * dọn state cũ bằng tay.
 *
 * Còn tin cũ hay không: dựa vào CẢ `messageCount` của thread lẫn việc trang vừa
 * tải có đầy không. Chỉ dựa một bên thì hoặc hiện nút thừa ở hội thoại 3 tin,
 * hoặc giấu nút sớm nếu server đếm khác cách web đếm.
 */
export function useThreadMessages(threadId: string) {
  const [thread, setThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<ArchivedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [lastPageFull, setLastPageFull] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.threadMessages(threadId, { limit: PAGE_SIZE });
      if (!alive.current) return;
      setThread(r.thread);
      setMessages(r.messages);
      setLastPageFull(r.messages.length >= PAGE_SIZE);
      setExhausted(r.messages.length === 0);
    } catch (err) {
      if (alive.current) setError(errorText(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const r = await api.threadMessages(threadId, { beforeId: oldest.id, limit: PAGE_SIZE });
      if (!alive.current) return;
      setThread(r.thread);
      if (r.messages.length === 0) {
        setExhausted(true);
      } else {
        setMessages((cur) => {
          const have = new Set(cur.map((m) => m.id));
          return [...r.messages.filter((m) => !have.has(m.id)), ...cur];
        });
        setLastPageFull(r.messages.length >= PAGE_SIZE);
      }
    } catch (err) {
      if (alive.current) setOlderError(errorText(err));
    } finally {
      if (alive.current) setLoadingOlder(false);
    }
  }, [messages, loadingOlder, threadId]);

  /** Lấy lại trang mới nhất (sau khi gửi tin, hoặc bấm làm mới) mà không mất các trang cũ đã tải */
  const refreshLatest = useCallback(async () => {
    try {
      const r = await api.threadMessages(threadId, { limit: PAGE_SIZE });
      if (!alive.current) return;
      setThread(r.thread);
      setMessages((cur) => mergeLatest(cur, r.messages));
    } catch (err) {
      if (alive.current) setOlderError(errorText(err));
    }
  }, [threadId]);

  const hasOlder =
    !exhausted && messages.length > 0 && (lastPageFull || (thread !== null && messages.length < thread.messageCount));

  return { thread, messages, loading, error, reload, hasOlder, loadingOlder, olderError, loadOlder, refreshLatest };
}
