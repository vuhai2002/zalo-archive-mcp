import type { DatabaseSync } from "node:sqlite";
import type { API } from "zca-js";
import type { Logger } from "pino";
import { CONTROLS_QUEUE } from "./offline-group-event-replay.js";
import {
  isNewerZaloId,
  readReplayCursors,
  saveReplayCursors,
  type ReplayQueue,
} from "../storage/offline-replay-cursor-store.js";

/**
 * Xin Zalo gửi lại những gì lỡ trong lúc listener tắt (tắt máy, đang dùng nick khác), từ năm hàng
 * chờ Zalo giữ cho tài khoản: cmd 510 tin 1-1, 511 tin nhóm, 610 cảm xúc 1-1, 611 cảm xúc nhóm, 603
 * điều khiển (sự kiện nhóm: thêm / rời / đổi tên). Tin về qua `old_messages`, cảm xúc qua
 * `old_reactions`, sự kiện nhóm qua khung WS đọc thẳng (offline-group-event-replay.ts); kho khử trùng
 * nên nhận lại thứ đã có không sao.
 *
 * Theo cách Zalo Web làm (`doGetOffline` / `onGotOffline`):
 * - xin TỪ MỐC đã lưu của hàng chờ (`{ first: true, lastId: mốc }`, chưa có mốc thì từ đầu hàng chờ);
 * - phản hồi có `more` thì xin trang sau `{ first: false, lastId: lastActionId }` tới khi hết;
 * - mỗi trang về thì lưu `lastActionId` làm mốc (offline-replay-cursor-store.ts), nên chạm trần trang
 *   hay mất kết nối giữa chừng thì lần sau đi tiếp, không mất phần cuối;
 * - lấy bù xong một hàng chờ thì tin / cảm xúc nhận trực tiếp sau đó cũng đẩy mốc lên (cùng hệ id),
 *   để lần tắt máy sau chỉ phải xin phần thật sự lỡ.
 * zca-js 2.2.0 bỏ mất `more` + `lastActionId`, nên bản vá zca-js phát thêm `old_messages_meta` và
 * `old_reactions_meta` (xem patches/zca-js@2.2.0.patch); `onPage` ở đây đọc chúng.
 *
 * Giữ nhịp, không dồn dập: mỗi lần kết nối xin MỘT lượt (nối lại trong vòng `minIntervalMs` thì
 * không xin); các hàng chờ bắt đầu lệch nhau vài giây, các trang cách nhau vài giây; tối đa
 * `MAX_PAGES` trang mỗi hàng chờ; trang không về trong `PAGE_TIMEOUT_MS` thì thôi.
 */
export type MissedMessageRequester = {
  onConnected: () => void;
  onPage: (queue: ReplayQueue, page: unknown) => void;
  /** Tin / cảm xúc nhận trực tiếp: đẩy mốc của hàng chờ đó lên nếu hàng chờ đã lấy bù xong */
  onLiveEvent: (queue: ReplayQueue, msgId: unknown) => void;
  stop: () => void;
};

export const MAX_PAGES = 30;
const PAGE_TIMEOUT_MS = 8_000;

/** Lệnh Zalo, tên hiện trong log, giờ bắt đầu sau khi kết nối (ms tối thiểu + khoảng ngẫu nhiên) */
const QUEUE: Record<ReplayQueue, { cmd: number; subCmd: number; label: string; startMs: number; spreadMs: number }> = {
  user_messages: { cmd: 510, subCmd: 1, label: "tin 1-1", startMs: 0, spreadMs: 0 },
  group_messages: { cmd: 511, subCmd: 1, label: "tin nhóm", startMs: 2_000, spreadMs: 3_000 },
  user_reactions: { cmd: 610, subCmd: 1, label: "cảm xúc 1-1", startMs: 8_000, spreadMs: 3_000 },
  group_reactions: { cmd: 611, subCmd: 1, label: "cảm xúc nhóm", startMs: 11_000, spreadMs: 3_000 },
  group_events: { cmd: CONTROLS_QUEUE.cmd, subCmd: CONTROLS_QUEUE.subCmd, label: "sự kiện nhóm", startMs: 14_000, spreadMs: 3_000 },
};
const QUEUES = Object.keys(QUEUE) as ReplayQueue[];

type Run = { pages: number; requested: string | null; fromCursor: boolean; evictWarned: boolean; waiting: ReturnType<typeof setTimeout> | null };
type PageMeta = { lastActionId?: unknown; more?: unknown; queueStatus?: Record<string, { evict?: unknown } | undefined> };

export function createMissedMessageRequester(
  api: API,
  db: DatabaseSync,
  log: Logger,
  opts: { minIntervalMs: number; now?: () => number; random?: () => number },
): MissedMessageRequester {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cursors = readReplayCursors(db);
  const run: Partial<Record<ReplayQueue, Run>> = {};
  // Hàng chờ đã lấy bù hết trong lần kết nối này: chỉ khi đó tin trực tiếp mới được đẩy mốc
  const caughtUp = new Set<ReplayQueue>();

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  const persist = () => {
    try {
      saveReplayCursors(db, cursors);
    } catch (err) {
      log.warn({ err }, "Không lưu được mốc lấy bù");
    }
  };

  const advance = (queue: ReplayQueue, id: string) => {
    if (!isNewerZaloId(id, cursors[queue])) return;
    cursors[queue] = id;
    persist();
  };

  const ask = (queue: ReplayQueue, r: Run, lastId: string | null, first: boolean) => {
    if (run[queue] !== r) return;
    const { cmd, subCmd, label } = QUEUE[queue];
    try {
      api.listener.sendWs({ version: 1, cmd, subCmd, data: { first, lastId, preIds: [] } });
      r.requested = lastId;
      r.waiting = later(PAGE_TIMEOUT_MS, () => {
        if (run[queue] !== r) return;
        delete run[queue];
        if (r.fromCursor && r.pages === 0) {
          // Zalo không trả lời khi xin từ mốc: bỏ mốc, lần sau xin từ đầu hàng chờ như trước
          delete cursors[queue];
          persist();
          log.warn({ queue }, `Zalo không trả lời khi xin bù ${label} từ mốc đã lưu - bỏ mốc, lần sau xin từ đầu`);
        } else {
          log.warn({ queue, page: r.pages + 1 }, `Không nhận được trang lấy bù (${label}) - dừng, lần sau đi tiếp từ mốc`);
        }
      });
    } catch (err) {
      log.warn({ err }, `Xin bù ${label} thất bại`);
      delete run[queue];
    }
  };

  const begin = (queue: ReplayQueue) => {
    const cursor = cursors[queue] ?? null;
    const r: Run = { pages: 0, requested: cursor, fromCursor: cursor !== null, evictWarned: false, waiting: null };
    run[queue] = r;
    ask(queue, r, cursor, true);
  };

  return {
    onConnected: () => {
      // Kết nối mới: chưa lấy bù xong hàng nào, tin trực tiếp chưa được đẩy mốc
      caughtUp.clear();
      const sinceLast = now() - lastRequestAt;
      if (sinceLast < opts.minIntervalMs) {
        log.debug({ sinceLastMs: sinceLast }, "Vừa xin bù tin lỡ gần đây - lần nối lại này bỏ qua");
        return;
      }
      lastRequestAt = now();
      for (const q of QUEUES) {
        const { startMs, spreadMs } = QUEUE[q];
        if (startMs === 0) begin(q);
        else later(startMs + Math.floor(random() * spreadMs), () => begin(q));
      }
    },

    onPage: (queue, page) => {
      const r = run[queue];
      if (!r) return;
      if (r.waiting) {
        clearTimeout(r.waiting);
        timers.delete(r.waiting);
        r.waiting = null;
      }
      r.pages++;
      const p = page as { count?: unknown; meta?: PageMeta } | null;
      const { cmd, subCmd, label } = QUEUE[queue];
      const nextId = p?.meta?.lastActionId;
      const next = typeof nextId === "string" || typeof nextId === "number" ? String(nextId) : null;
      const more = p?.meta?.more === true || p?.meta?.more === 1;
      const evict = p?.meta?.queueStatus?.[`${cmd}_${subCmd}`]?.evict;
      if ((evict === 1 || evict === true) && !r.evictWarned) {
        r.evictWarned = true;
        log.warn({ queue }, `Zalo báo hàng chờ ${label} đã đầy và bỏ bớt phần cũ - một ít có thể đã mất`);
      }
      if (next) advance(queue, next);
      log.info({ page: r.pages, count: p?.count, more }, `Đã nhận trang lấy bù (${label})`);

      if (!more) {
        delete run[queue];
        caughtUp.add(queue);
        return;
      }
      if (!next || next === r.requested) {
        delete run[queue];
        log.warn({ queue }, `Trang lấy bù (${label}) báo còn nữa nhưng thiếu mã trang - dừng`);
        return;
      }
      if (r.pages >= MAX_PAGES) {
        delete run[queue];
        log.warn({ queue, pages: r.pages }, `Lấy bù ${label} chạm trần trang - lần kết nối sau đi tiếp từ mốc`);
        return;
      }
      later(2_000 + Math.floor(random() * 2_000), () => ask(queue, r, next, false));
    },

    onLiveEvent: (queue, msgId) => {
      if (!caughtUp.has(queue)) return;
      if (typeof msgId === "string" || typeof msgId === "number") advance(queue, String(msgId));
    },

    stop: () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const q of QUEUES) delete run[q];
      caughtUp.clear();
    },
  };
}
