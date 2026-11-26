import type { DatabaseSync } from "node:sqlite";
import type { API } from "zca-js";
import type { Logger } from "pino";
import { recordBackfillRun } from "../storage/backfill-run-store.js";
import {
  isNewerZaloId,
  readReplayCursors,
  saveReplayCursors,
  type ReplayQueue,
} from "../storage/offline-replay-cursor-store.js";
import {
  BURST_PAUSE_MS,
  CURSOR_STRIKES_TO_DROP,
  MAX_PAGES_PER_ROUND,
  PAGE_TIMEOUT_MS,
  PAGES_PER_BURST,
  readReplayPage,
  REPLAY_QUEUES,
  RETRY_DELAYS_MS,
} from "./offline-replay-pacing.js";

/**
 * Xin Zalo gửi lại những gì lỡ trong lúc listener tắt (tắt máy, máy ngủ, mất mạng), từ năm hàng chờ Zalo giữ cho tài
 * khoản: cmd 510 tin 1-1, 511 tin nhóm, 610 cảm xúc 1-1, 611 cảm xúc nhóm, 603 điều khiển (sự kiện nhóm). Tin về qua
 * `old_messages`, cảm xúc qua `old_reactions`, sự kiện nhóm qua khung WS đọc thẳng (offline-group-event-replay.ts); kho
 * khử trùng nên nhận lại thứ đã có không sao.
 *
 * Theo cách Zalo Web làm (`doGetOffline` / `onGotOffline`):
 * - xin TỪ MỐC đã lưu của hàng chờ (`{ first: true, lastId: mốc }`, chưa có mốc thì từ đầu hàng chờ);
 * - phản hồi có `more` thì xin trang sau `{ first: false, lastId: lastActionId }` tới khi hết, theo đợt
 *   (offline-replay-pacing.ts): hàng chờ dồn nhiều (vd mốc bị mất) vẫn lấy hết trong lần nối này;
 * - mỗi trang về thì lưu `lastActionId` làm mốc (offline-replay-cursor-store.ts), nên mất kết nối giữa chừng thì lần
 *   sau đi tiếp, không mất phần cuối;
 * - lấy bù xong một hàng chờ thì tin / cảm xúc nhận trực tiếp sau đó cũng đẩy mốc lên (cùng hệ id).
 * zca-js 2.2.0 bỏ mất `more` + `lastActionId`, nên bản vá zca-js phát thêm `old_messages_meta` và `old_reactions_meta`
 * (xem patches/zca-js@2.2.0.patch); `onPage` ở đây đọc chúng.
 *
 * Mạng yếu (chưa có wifi, wifi chập chờn, máy vừa thức Zalo trả chậm): trang không về thì giữ mốc, hỏi lại giãn dần; trang
 * về trễ vẫn nhận, bản trả lời trùng bị bỏ qua. Mốc chỉ bị bỏ khi Zalo trả các hàng chờ khác mà riêng hàng chờ này hỏi từ
 * mốc không bao giờ trả, ở nhiều lần kết nối - mất mốc nghĩa là phải đi lại cả hàng chờ (khoảng 2 tuần).
 */
export type MissedMessageRequester = {
  onConnected: () => void;
  /**
   * Xin bù ngay (không chờ khoảng tối thiểu) - dùng khi máy vừa thức mà kết nối không đứt: không có lần nối lại nào nên
   * lượt lấy bù thường không chạy. false nếu đang có lượt dở.
   */
  requestNow: () => boolean;
  onPage: (queue: ReplayQueue, page: unknown) => void;
  /** Tin / cảm xúc nhận trực tiếp: đẩy mốc của hàng chờ đó lên nếu hàng chờ đã lấy bù xong */
  onLiveEvent: (queue: ReplayQueue, msgId: unknown) => void;
  /** Kết nối vừa đóng: bỏ các lượt đang dở, giữ nguyên mốc; lần kết nối sau xin lại ngay, không chờ `minIntervalMs` */
  onDisconnected: () => void;
  stop: () => void;
};

const QUEUES = Object.keys(REPLAY_QUEUES) as ReplayQueue[];

type Run = {
  pages: number;
  /** Số trang của đợt đang chạy (tới `PAGES_PER_BURST` thì nghỉ) */
  burstPages: number;
  /** Mốc của lần hỏi gần nhất / sắp hỏi: trang trả lời thật phải có mã trang mới hơn, không thì là bản trùng */
  requested: string | null;
  first: boolean;
  fromCursor: boolean;
  /** Số lần đã hỏi lại trang đang chờ (trang không về kịp) */
  retries: number;
  evictWarned: boolean;
  /** Hẹn giờ chờ trang / chờ hỏi lại: trang về thì hủy */
  waiting: ReturnType<typeof setTimeout> | null;
  /** Để ghi kết quả lượt (backfill-run-store.ts): bắt đầu lúc nào, Zalo gửi lại bao nhiêu mục */
  startedAt: string;
  items: number;
};

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
  // Kết nối này Zalo đã trả trang nào chưa (mạng tốt) - để phân biệt "mạng yếu" với "Zalo chê mốc"
  let answeredThisConnection = false;
  // Số lần kết nối liền nhau mà hỏi từ mốc không bao giờ được trả dù mạng tốt
  const cursorStrikes: Partial<Record<ReplayQueue, number>> = {};

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const cancel = (t: ReturnType<typeof setTimeout> | null) => {
    if (!t) return;
    clearTimeout(t);
    timers.delete(t);
  };

  const clearAll = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const q of QUEUES) delete run[q];
    caughtUp.clear();
    answeredThisConnection = false;
  };

  const persist = () => {
    try {
      saveReplayCursors(db, cursors);
    } catch (err) {
      log.warn({ err }, "Không lưu được mốc lấy bù");
    }
  };

  /** Kết thúc lượt của một hàng chờ và ghi kết quả (đủ / dừng dở kèm lý do) để báo khoảng không nghe đã lấy bù đủ chưa */
  const finish = (queue: ReplayQueue, r: Run, outcome: "complete" | "incomplete", detail: string | null) => {
    if (run[queue] === r) delete run[queue];
    cancel(r.waiting);
    r.waiting = null;
    // Lượt dừng dở: lần kết nối sau xin lại ngay, không chờ khoảng tối thiểu giữa hai lượt
    if (outcome === "incomplete") lastRequestAt = Number.NEGATIVE_INFINITY;
    try {
      const finishedAt = new Date(now()).toISOString();
      recordBackfillRun(db, { queue, startedAt: r.startedAt, finishedAt, pages: r.pages, items: r.items, outcome, detail });
    } catch (err) {
      log.warn({ err }, "Không ghi được kết quả lấy bù");
    }
  };

  const advance = (queue: ReplayQueue, id: string) => {
    if (!isNewerZaloId(id, cursors[queue])) return;
    cursors[queue] = id;
    persist();
  };

  /** Hết mọi lần hỏi lại mà trang vẫn không về: dừng lượt, giữ mốc (trừ khi chắc Zalo chê mốc) */
  const giveUp = (queue: ReplayQueue, r: Run) => {
    const { label } = REPLAY_QUEUES[queue];
    finish(queue, r, "incomplete", `Zalo không trả trang ${r.pages + 1} sau ${r.retries + 1} lần hỏi - lần nối sau đi tiếp từ mốc`);
    if (r.fromCursor && r.pages === 0 && answeredThisConnection) {
      const strikes = (cursorStrikes[queue] ?? 0) + 1;
      cursorStrikes[queue] = strikes;
      if (strikes >= CURSOR_STRIKES_TO_DROP) {
        delete cursors[queue];
        delete cursorStrikes[queue];
        persist();
        log.warn({ queue, strikes }, `Zalo trả các hàng chờ khác nhưng không bao giờ trả ${label} từ mốc đã lưu - bỏ mốc, lần sau xin từ đầu`);
        return;
      }
    }
    log.warn({ queue, page: r.pages + 1 }, `Không nhận được trang lấy bù (${label}) - giữ mốc, lần nối sau đi tiếp`);
  };

  const ask = (queue: ReplayQueue, r: Run, lastId: string | null, first: boolean) => {
    if (run[queue] !== r) return;
    const { cmd, subCmd, label } = REPLAY_QUEUES[queue];
    try {
      api.listener.sendWs({ version: 1, cmd, subCmd, data: { first, lastId, preIds: [] } });
      r.requested = lastId;
      r.first = first;
      r.waiting = later(PAGE_TIMEOUT_MS, () => {
        if (run[queue] !== r) return;
        r.waiting = null;
        const delay = RETRY_DELAYS_MS[r.retries];
        if (delay === undefined) return giveUp(queue, r);
        r.retries++;
        log.info({ queue, page: r.pages + 1, retry: r.retries, delayMs: delay }, `Trang lấy bù (${label}) chưa về - hỏi lại cùng mốc sau một lúc`);
        r.waiting = later(delay, () => ask(queue, r, r.requested, r.first));
      });
    } catch (err) {
      log.warn({ err }, `Xin bù ${label} thất bại`);
      finish(queue, r, "incomplete", "Gửi lệnh xin bù tới Zalo thất bại");
    }
  };

  const begin = (queue: ReplayQueue) => {
    const cursor = cursors[queue] ?? null;
    const startedAt = new Date(now()).toISOString();
    const r: Run = { pages: 0, burstPages: 0, requested: cursor, first: true, fromCursor: cursor !== null, retries: 0, evictWarned: false, waiting: null, startedAt, items: 0 };
    run[queue] = r;
    ask(queue, r, cursor, true);
  };

  /** Một lượt cho cả năm hàng chờ, lệch giờ nhau; trong lúc lấy bù tin trực tiếp chưa được đẩy mốc */
  const startRound = () => {
    caughtUp.clear();
    lastRequestAt = now();
    for (const q of QUEUES) {
      const { startMs, spreadMs } = REPLAY_QUEUES[q];
      if (startMs === 0) begin(q);
      else later(startMs + Math.floor(random() * spreadMs), () => begin(q));
    }
  };

  return {
    onConnected: () => {
      answeredThisConnection = false;
      const sinceLast = now() - lastRequestAt;
      if (sinceLast < opts.minIntervalMs) {
        // Kết nối mới: tin trực tiếp chưa được đẩy mốc tới khi lấy bù xong (lần này bỏ qua nên chờ lần sau)
        caughtUp.clear();
        log.debug({ sinceLastMs: sinceLast }, "Vừa xin bù tin lỡ gần đây - lần nối lại này bỏ qua");
        return;
      }
      startRound();
    },

    requestNow: () => {
      if (timers.size > 0 || QUEUES.some((q) => run[q])) return false;
      startRound();
      return true;
    },

    onPage: (queue, page) => {
      const r = run[queue];
      if (!r) return;
      const pg = readReplayPage(queue, page);
      const { label } = REPLAY_QUEUES[queue];
      // Hỏi lại sau khi trang về trễ thì Zalo trả hai lần: bản sau không đưa mã trang mới hơn - bỏ qua, đang chờ trang kế
      if (pg.more && pg.next !== null && r.requested !== null && !isNewerZaloId(pg.next, r.requested)) {
        log.debug({ queue }, `Bỏ qua trang lấy bù (${label}) trùng`);
        return;
      }
      cancel(r.waiting);
      r.waiting = null;
      answeredThisConnection = true;
      delete cursorStrikes[queue];
      r.retries = 0;
      r.pages++;
      r.burstPages++;
      r.items += pg.count;
      if (pg.evicted && !r.evictWarned) {
        r.evictWarned = true;
        log.warn({ queue }, `Zalo báo hàng chờ ${label} đã đầy và bỏ bớt phần cũ - một ít có thể đã mất`);
      }
      if (pg.next) advance(queue, pg.next);
      log.info({ page: r.pages, count: pg.count, more: pg.more }, `Đã nhận trang lấy bù (${label})`);

      if (!pg.more) {
        finish(queue, r, r.evictWarned ? "incomplete" : "complete", r.evictWarned ? "Zalo báo hàng chờ đã đầy và bỏ bớt phần cũ" : null);
        caughtUp.add(queue);
        return;
      }
      if (!pg.next) {
        finish(queue, r, "incomplete", "Zalo báo còn trang nhưng thiếu mã trang");
        log.warn({ queue }, `Trang lấy bù (${label}) báo còn nữa nhưng thiếu mã trang - dừng`);
        return;
      }
      if (r.pages >= MAX_PAGES_PER_ROUND) {
        finish(queue, r, "incomplete", `Chạm trần trang (${MAX_PAGES_PER_ROUND} trang mỗi lần nối) - lần nối sau đi tiếp`);
        log.warn({ queue, pages: r.pages }, `Lấy bù ${label} chạm trần trang - lần kết nối sau đi tiếp từ mốc`);
        return;
      }
      const next = pg.next;
      r.requested = next; // từ giờ bản trả lời trùng của trang vừa nhận bị nhận ra là trùng
      r.first = false;
      let gapMs = 2_000 + Math.floor(random() * 2_000);
      if (r.burstPages >= PAGES_PER_BURST) {
        r.burstPages = 0;
        gapMs = BURST_PAUSE_MS;
        log.info({ queue, pages: r.pages }, `Lấy bù ${label} còn nhiều - nghỉ một lúc rồi lấy tiếp`);
      }
      later(gapMs, () => ask(queue, r, next, false));
    },

    onLiveEvent: (queue, msgId) => {
      if (!caughtUp.has(queue)) return;
      if (typeof msgId === "string" || typeof msgId === "number") advance(queue, String(msgId));
    },

    onDisconnected: () => {
      const unfinished = timers.size > 0 || QUEUES.some((q) => run[q]);
      for (const q of QUEUES) {
        const r = run[q];
        if (r) finish(q, r, "incomplete", "Mất kết nối giữa chừng - lần nối sau xin tiếp");
      }
      clearAll();
      if (unfinished) lastRequestAt = Number.NEGATIVE_INFINITY;
    },

    stop: () => clearAll(),
  };
}
