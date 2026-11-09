import { useCallback, useEffect, useRef, useState } from "react";
import type { ArchivedMessage, ThreadMessagesResponse } from "../../archive-api-types";
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

const notIn = (cur: ArchivedMessage[]) => {
  const have = new Set(cur.map((m) => m.id));
  return (m: ArchivedMessage) => !have.has(m.id);
};

/**
 * Tin của MỘT hội thoại, phân trang lùi bằng `beforeId`. Component dùng hook
 * này được key theo threadId nên đổi hội thoại là dựng lại từ đầu, không phải
 * dọn state cũ bằng tay.
 *
 * Còn tin cũ hay không: dựa vào CẢ `messageCount` của thread lẫn việc trang vừa
 * tải có đầy không. Chỉ dựa một bên thì hoặc hiện nút thừa ở hội thoại 3 tin,
 * hoặc giấu nút sớm nếu server đếm khác cách web đếm.
 *
 * Nhảy tới một tin (kết quả tìm kiếm): `jumpTo` tải một trang QUANH tin đó, nên phần đang xem không
 * còn chạm tin mới nhất (`atLatest` = false) - cuộn xuống thì `loadNewer` tải tiếp, và tin mới tới
 * (SSE) không chèn vào giữa cho tới khi xem lại tới cuối. `initialAroundId`: mở hội thoại thẳng tại tin đó.
 */
export function useThreadMessages(threadId: string, initialAroundId?: number) {
  const [thread, setThread] = useState<ThreadMessagesResponse["thread"] | null>(null);
  const [messages, setMessages] = useState<ArchivedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [lastPageFull, setLastPageFull] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [atLatest, setAtLatest] = useState(true);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const alive = useRef(true);
  const atLatestRef = useRef(true);
  const firstAround = useRef(initialAroundId);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const markLatest = (v: boolean) => {
    atLatestRef.current = v;
    setAtLatest(v);
  };

  /** Tải lại từ đầu: trang mới nhất, hoặc trang quanh một tin (`aroundId`) */
  const load = useCallback(
    async (aroundId?: number) => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.threadMessages(threadId, { limit: PAGE_SIZE, aroundId });
        if (!alive.current) return;
        setThread(r.thread);
        setMessages(r.messages);
        // Trang quanh một tin: coi như còn tin cũ (đếm theo messageCount) và chưa chạm tin mới nhất
        setLastPageFull(aroundId ? true : r.messages.length >= PAGE_SIZE);
        setExhausted(r.messages.length === 0);
        markLatest(!aroundId);
      } catch (err) {
        if (alive.current) setError(errorText(err));
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [threadId],
  );

  const reload = useCallback(() => load(), [load]);

  useEffect(() => {
    const around = firstAround.current;
    firstAround.current = undefined;
    void load(around);
  }, [load]);

  /** Tin đã nằm trong phần đang xem thì thôi (true); chưa thì tải trang quanh nó */
  const jumpTo = useCallback(
    async (messageId: number): Promise<boolean> => {
      if (messages.some((m) => m.id === messageId)) return true;
      await load(messageId);
      return false;
    },
    [messages, load],
  );

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
        setMessages((cur) => [...r.messages.filter(notIn(cur)), ...cur]);
        setLastPageFull(r.messages.length >= PAGE_SIZE);
      }
    } catch (err) {
      if (alive.current) setOlderError(errorText(err));
    } finally {
      if (alive.current) setLoadingOlder(false);
    }
  }, [messages, loadingOlder, threadId]);

  /** Sau khi nhảy tới tin cũ: cuộn xuống thì tải các tin mới hơn, hết thì phần đang xem đã chạm cuối */
  const loadNewer = useCallback(async () => {
    const newest = messages.at(-1);
    if (!newest || loadingNewer || atLatestRef.current) return;
    setLoadingNewer(true);
    try {
      const r = await api.threadMessages(threadId, { afterId: newest.id, limit: PAGE_SIZE });
      if (!alive.current) return;
      setMessages((cur) => [...cur, ...r.messages.filter(notIn(cur))]);
      if (r.messages.length < PAGE_SIZE) markLatest(true);
    } catch (err) {
      if (alive.current) setOlderError(errorText(err));
    } finally {
      if (alive.current) setLoadingNewer(false);
    }
  }, [messages, loadingNewer, threadId]);

  /** Lấy lại trang mới nhất (sau khi gửi tin, hoặc có tin mới) mà không mất các trang cũ đã tải */
  const refreshLatest = useCallback(async () => {
    // Đang xem đoạn cũ (nhảy từ kết quả tìm): không chèn tin mới vào giữa, cuộn tới cuối sẽ tự tải
    if (!atLatestRef.current) return;
    try {
      const r = await api.threadMessages(threadId, { limit: PAGE_SIZE });
      if (!alive.current || !atLatestRef.current) return;
      setThread(r.thread);
      setMessages((cur) => mergeLatest(cur, r.messages));
    } catch (err) {
      if (alive.current) setOlderError(errorText(err));
    }
  }, [threadId]);

  /** Tin vừa xóa khỏi kho: bỏ khỏi khung chat ngay, không phải tải lại */
  const dropMessages = useCallback((ids: readonly number[]) => {
    const gone = new Set(ids);
    setMessages((cur) => cur.filter((m) => !gone.has(m.id)));
    setThread((t) => (t ? { ...t, messageCount: Math.max(0, t.messageCount - gone.size) } : t));
  }, []);

  const hasOlder =
    !exhausted && messages.length > 0 && (lastPageFull || (thread !== null && messages.length < thread.messageCount));

  return {
    thread,
    messages,
    loading,
    error,
    reload,
    jumpTo,
    hasOlder,
    loadingOlder,
    olderError,
    loadOlder,
    atLatest,
    loadingNewer,
    loadNewer,
    refreshLatest,
    dropMessages,
  };
}
