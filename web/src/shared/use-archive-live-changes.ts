import { useEffect, useRef } from "react";

/**
 * Dashboard tự cập nhật: MỘT kết nối Server-Sent Events (`/api/events`) dùng chung cho cả trang,
 * mở khi có component nghe và đóng khi không còn ai. Máy chủ gửi `change` kèm các hội thoại vừa có
 * tin / cảm xúc / file mới. Rớt kết nối (máy ngủ, daemon chạy lại) thì trình duyệt tự nối lại; nối
 * lại xong báo "all" để mọi nơi tải bù những gì lỡ trong lúc mất kết nối.
 */
export type LiveChange = string[] | "all";
type Listener = (change: LiveChange) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let lostConnection = false;

const emit = (change: LiveChange) => {
  for (const l of listeners) l(change);
};

function connect(): void {
  source = new EventSource("/api/events");
  source.addEventListener("change", (e) => {
    try {
      const ids = (JSON.parse((e as MessageEvent<string>).data) as { threadIds?: unknown }).threadIds;
      if (Array.isArray(ids)) emit(ids.filter((x): x is string => typeof x === "string"));
    } catch {
      // Gói lạ thì bỏ qua, lần báo sau vẫn đúng
    }
  });
  source.addEventListener("ready", () => {
    if (!lostConnection) return;
    lostConnection = false;
    emit("all");
  });
  source.onerror = () => {
    lostConnection = true;
  };
}

/** Gọi `onChange` mỗi khi kho đổi; luôn dùng bản `onChange` mới nhất (không cần useCallback) */
export function useArchiveLiveChanges(onChange: Listener): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const l: Listener = (c) => latest.current(c);
    listeners.add(l);
    if (!source) connect();
    return () => {
      listeners.delete(l);
      if (listeners.size === 0 && source) {
        source.close();
        source = null;
      }
    };
  }, []);
}
