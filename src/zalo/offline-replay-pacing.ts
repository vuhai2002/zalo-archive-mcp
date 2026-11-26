import type { ReplayQueue } from "../storage/offline-replay-cursor-store.js";
import { CONTROLS_QUEUE } from "./offline-group-event-replay.js";

/**
 * Nhịp xin bù tin lỡ (offline-message-replay.ts) và cách đọc một trang Zalo trả về. Tách riêng để dễ chỉnh / test.
 *
 * Mạng yếu là chuyện thường (mở máy chỗ chưa có wifi, wifi chập chờn, máy vừa thức Zalo trả chậm), nên:
 * - trang không về kịp thì GIỮ mốc và hỏi lại cùng chỗ đó, giãn dần; trang về trễ vẫn nhận;
 * - mất kết nối thì giữ mốc, lần nối lại xin tiếp ngay (xử lý ở requester);
 * - còn nhiều trang thì lấy theo đợt, nghỉ giữa các đợt, tới khi hết hàng chờ - không bỏ dở chờ lần nối sau.
 */

/** Một đợt liền nhau tối đa chừng này trang, rồi nghỉ `BURST_PAUSE_MS` */
export const PAGES_PER_BURST = 30;
export const BURST_PAUSE_MS = 60_000;
/** Trần cứng mỗi lượt (đủ cho cả hàng chờ khoảng 2 tuần Zalo giữ); quá thì dừng, lần nối sau đi tiếp từ mốc */
export const MAX_PAGES_PER_ROUND = 600;
/** Chờ một trang chừng này; máy vừa thức Zalo có khi trả sau 20-30 giây */
export const PAGE_TIMEOUT_MS = 15_000;
/** Trang không về: hỏi lại cùng mốc sau lần lượt các khoảng này (cộng chờ trang), hết thì thôi tới lần nối sau */
export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 240_000];
/**
 * Bỏ mốc (xin lại từ đầu hàng chờ) chỉ khi chắc Zalo chê mốc: hỏi từ mốc hết mọi lần thử mà không trả, trong khi các hàng
 * chờ khác trên CÙNG kết nối vẫn trả (mạng tốt) - lặp lại ở chừng này lần kết nối. Mạng chập chờn không bao giờ làm mất mốc.
 */
export const CURSOR_STRIKES_TO_DROP = 2;

/** Lệnh Zalo, tên hiện trong log, giờ bắt đầu sau khi kết nối (ms tối thiểu + khoảng ngẫu nhiên) */
export const REPLAY_QUEUES: Record<ReplayQueue, { cmd: number; subCmd: number; label: string; startMs: number; spreadMs: number }> = {
  user_messages: { cmd: 510, subCmd: 1, label: "tin 1-1", startMs: 0, spreadMs: 0 },
  group_messages: { cmd: 511, subCmd: 1, label: "tin nhóm", startMs: 2_000, spreadMs: 3_000 },
  user_reactions: { cmd: 610, subCmd: 1, label: "cảm xúc 1-1", startMs: 8_000, spreadMs: 3_000 },
  group_reactions: { cmd: 611, subCmd: 1, label: "cảm xúc nhóm", startMs: 11_000, spreadMs: 3_000 },
  group_events: { cmd: CONTROLS_QUEUE.cmd, subCmd: CONTROLS_QUEUE.subCmd, label: "sự kiện nhóm", startMs: 14_000, spreadMs: 3_000 },
};

export type ReplayPage = { count: number; next: string | null; more: boolean; evicted: boolean };

/** Đọc phần Zalo trả kèm trang (bản vá zca-js phát qua `old_*_meta`): số mục, mã trang tiếp, còn nữa không, hàng chờ đầy chưa */
export function readReplayPage(queue: ReplayQueue, page: unknown): ReplayPage {
  type Meta = { lastActionId?: unknown; more?: unknown; queueStatus?: Record<string, { evict?: unknown } | undefined> };
  const p = page as { count?: unknown; meta?: Meta } | null;
  const { cmd, subCmd } = REPLAY_QUEUES[queue];
  const id = p?.meta?.lastActionId;
  const evict = p?.meta?.queueStatus?.[`${cmd}_${subCmd}`]?.evict;
  return {
    count: Number(p?.count) || 0,
    next: typeof id === "string" || typeof id === "number" ? String(id) : null,
    more: p?.meta?.more === true || p?.meta?.more === 1,
    evicted: evict === 1 || evict === true,
  };
}
