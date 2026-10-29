import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState, SessionStatus } from "../archive-api-types";
import { api } from "../dashboard-api-client";
import type { KillSwitchState } from "./dashboard-shell-context";

const SLOW_MS = 15_000;
const FAST_MS = 2_000;
/** Đang ở các trạng thái này thì màn hình phải đổi theo từng giây (QR, đăng nhập) */
const FAST_STATES = new Set<SessionState>(["qr_pending", "logging_in"]);
/** Sau một thao tác, hỏi dồn trong khoảng này: server có thể đổi trạng thái chậm một nhịp */
const BOOST_MS = 10_000;

/**
 * Hỏi định kỳ phiên Zalo + khóa khẩn cấp cho sidebar và các trang.
 *
 * Nhịp phiên tự co giãn: 15 giây bình thường, 2 giây khi đang chờ quét QR hoặc
 * đang đăng nhập. Không tách vòng 2 giây riêng ở trang Tài khoản: hai vòng cùng
 * hỏi `/api/session` thì sidebar và trang có lúc hiện hai trạng thái khác nhau.
 */
export function useShellStatusPolling(enabled: boolean) {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [killSwitch, setKillSwitch] = useState<KillSwitchState | null>(null);
  const boostUntil = useRef(0);
  // Đổi số này là khởi động lại vòng hỏi ngay (hủy hẹn giờ đang chờ)
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let state: SessionState | null = null;
      try {
        const s = await api.session();
        if (stopped) return;
        setSession(s);
        state = s.state;
      } catch {
        // Lỗi mạng thoáng qua: giữ trạng thái cũ, lượt sau hỏi lại
      }
      if (stopped) return;
      const fast = (state !== null && FAST_STATES.has(state)) || Date.now() < boostUntil.current;
      timer = setTimeout(tick, fast ? FAST_MS : SLOW_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, restartKey]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const load = () =>
      api
        .settings()
        .then((r) => !stopped && setKillSwitch(r.killSwitch))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, SLOW_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled]);

  const applySession = useCallback((s: SessionStatus) => {
    setSession(s);
    boostUntil.current = Date.now() + BOOST_MS;
    setRestartKey((k) => k + 1);
  }, []);

  return { session, killSwitch, applySession, applyKillSwitch: setKillSwitch };
}
