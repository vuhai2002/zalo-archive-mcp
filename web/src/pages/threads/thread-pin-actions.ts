import { useEffect } from "react";
import { api } from "../../dashboard-api-client";

/**
 * Ghim / bỏ ghim hội thoại (lưu trong kho). Danh sách hội thoại và bảng thông tin ở hai cây
 * component khác nhau: ghim xong phát một sự kiện để danh sách tự tải lại thứ tự mới.
 */
const THREADS_CHANGED = "zalo-archive:threads-changed";

export async function setThreadPinned(threadId: string, pinned: boolean): Promise<boolean> {
  const r = await api.setThreadPinned(threadId, pinned);
  window.dispatchEvent(new Event(THREADS_CHANGED));
  return r.pinned;
}

export function useOnThreadsChanged(onChange: () => void): void {
  useEffect(() => {
    window.addEventListener(THREADS_CHANGED, onChange);
    return () => window.removeEventListener(THREADS_CHANGED, onChange);
  }, [onChange]);
}
