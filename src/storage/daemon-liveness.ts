import type { DatabaseSync } from "node:sqlite";
import { getMeta } from "./thread-directory-store.js";

/** Heartbeat ghi mỗi phút khi listener nối; cũ hơn 3 phút là daemon/listener không còn chạy */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/**
 * Daemon có đang ở trạng thái gửi được không - để MCP báo ngay "daemon không
 * chạy" thay vì xếp tin vào hàng đợi rồi để nó nằm đó không ai gửi.
 * Đọc từ `meta` mà daemon ghi (hai tiến trình chung một DB).
 */
export function daemonSendReadiness(db: DatabaseSync, nowMs: number): { ready: true } | { ready: false; reason: string } {
  const state = getMeta(db, "daemon_session_state");
  if (state !== "running") {
    return {
      ready: false,
      reason: `Daemon chưa sẵn sàng gửi (trạng thái: ${state ?? "chưa từng chạy"}). Người dùng cần chạy "pnpm start" và đăng nhập Zalo trên dashboard.`,
    };
  }
  const heartbeat = getMeta(db, "listener_heartbeat_at");
  if (!heartbeat || nowMs - Date.parse(heartbeat) > HEARTBEAT_STALE_MS) {
    return {
      ready: false,
      reason: `Listener Zalo không hoạt động (heartbeat cuối: ${heartbeat ?? "chưa có"}). Daemon có thể đã tắt hoặc đang mất kết nối.`,
    };
  }
  return { ready: true };
}
