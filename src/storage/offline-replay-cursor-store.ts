import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Mốc lấy bù của từng hàng chờ Zalo giữ cho tài khoản (tin 1-1, tin nhóm, cảm xúc 1-1, cảm xúc
 * nhóm, sự kiện nhóm): id của việc mới nhất kho đã có. Lần kết nối sau xin tiếp TỪ mốc này, như Zalo Web nhớ
 * `lastActionId` của từng hàng chờ - không xin lại từ đầu hàng chờ (có khi từ hôm trước), kẻo hết
 * trần trang mà chưa tới phần thật sự lỡ. Id Zalo tăng theo thời gian nên mốc chỉ tiến, không lùi.
 */
export type ReplayQueue = "user_messages" | "group_messages" | "user_reactions" | "group_reactions" | "group_events";
export type ReplayCursors = Partial<Record<ReplayQueue, string>>;

const KEY = "offline_replay_cursors";
const QUEUES: ReplayQueue[] = ["user_messages", "group_messages", "user_reactions", "group_reactions", "group_events"];
const DIGITS = /^\d+$/;

/** `id` là id Zalo hợp lệ và mới hơn `than` (chưa có mốc thì id hợp lệ nào cũng mới hơn) */
export function isNewerZaloId(id: string, than: string | undefined): boolean {
  if (!DIGITS.test(id) || /^0+$/.test(id)) return false;
  return than === undefined || BigInt(id) > BigInt(than);
}

export function readReplayCursors(db: DatabaseSync): ReplayCursors {
  try {
    const v = JSON.parse(getMeta(db, KEY) ?? "{}") as Record<string, unknown> | null;
    const out: ReplayCursors = {};
    for (const q of QUEUES) {
      const id = v?.[q];
      if (typeof id === "string" && DIGITS.test(id)) out[q] = id;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveReplayCursors(db: DatabaseSync, cursors: ReplayCursors): void {
  setMeta(db, KEY, JSON.stringify(cursors));
}
