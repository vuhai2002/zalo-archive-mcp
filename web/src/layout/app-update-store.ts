import { useEffect, useState } from "react";
import type { UpdateInfo } from "../archive-api-types";
import { api } from "../dashboard-api-client";
import { APP_UPDATE_POLL_MS } from "./app-update-agent-prompt";

/**
 * Trạng thái "có bản mới" dùng chung cho cả trang: nút ở thanh bên và mục Cài đặt > Giới thiệu đọc cùng một chỗ, nên bấm
 * "Kiểm tra cập nhật" xong thì nút ở thanh bên đổi theo ngay. Một vòng hỏi duy nhất (15 phút một lần + khi quay lại tab), chạy
 * khi còn ít nhất một chỗ đang nghe. Hỏi lỗi thì giữ kết quả cũ.
 */
let current: UpdateInfo | null = null;
const listeners = new Set<(i: UpdateInfo | null) => void>();
let stopPolling: (() => void) | null = null;

function publish(info: UpdateInfo): UpdateInfo {
  current = info;
  for (const l of listeners) l(info);
  return info;
}

const load = () => api.version().then(publish, () => current);

/** Nút "Kiểm tra cập nhật": hỏi GitHub ngay (máy chủ giữ tối thiểu 1 phút giữa hai lần hỏi thật) */
export const checkForUpdateNow = () => api.versionCheck().then(publish);

function startPolling(): () => void {
  void load();
  const t = setInterval(load, APP_UPDATE_POLL_MS);
  const onVisible = () => document.visibilityState === "visible" && void load();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(t);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Kết quả kiểm tra bản mới gần nhất (null khi chưa có) */
export function useAppUpdateState(): UpdateInfo | null {
  const [info, setInfo] = useState(current);
  useEffect(() => {
    listeners.add(setInfo);
    stopPolling ??= startPolling();
    return () => {
      listeners.delete(setInfo);
      if (listeners.size === 0) {
        stopPolling?.();
        stopPolling = null;
      }
    };
  }, []);
  return info;
}
