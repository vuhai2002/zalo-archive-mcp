import { ThreadType, type API } from "zca-js";
import type { Logger } from "pino";

/**
 * Xin Zalo gửi lại tin lỡ trong lúc listener tắt (tắt máy, đang dùng nick khác):
 * cmd 510 tin 1-1, 511 tin nhóm. Tin trả về đi qua sự kiện `old_messages`, kho ghi
 * với `source = 'old_messages'` và khử trùng theo msg_id như mọi tin khác.
 *
 * Nhiều trang (theo cách Zalo Web làm, đọc từ `doGetOffline`): trang đầu `first: true`;
 * phản hồi có `more` + `lastActionId` thì xin trang sau `{ first: false, lastId: lastActionId }`.
 * zca-js 2.2.0 bỏ mất hai trường đó, nên bản vá zca-js phát thêm `old_messages_meta`
 * (xem patches/zca-js@2.2.0.patch) và `onPage` ở đây đọc nó.
 *
 * Giữ nhịp như Zalo Web, không dồn dập:
 * - mỗi lần kết nối xin MỘT lượt; nối lại trong vòng `minIntervalMs` thì không xin lại;
 * - tin 1-1 trước, tin nhóm sau vài giây ngẫu nhiên; các trang cách nhau vài giây;
 * - tối đa `MAX_PAGES` trang mỗi loại; trang không về trong `PAGE_TIMEOUT_MS` thì thôi.
 * Phản hồi không có mã trang tiếp theo (tên trường khác...) thì chỉ dừng ở trang đầu.
 */
export type MissedMessageRequester = { onConnected: () => void; onPage: (page: unknown) => void; stop: () => void };

export const MAX_PAGES = 5;
const PAGE_TIMEOUT_MS = 8_000;

type Kind = "user" | "group";
const LABEL: Record<Kind, string> = { user: "tin 1-1", group: "tin nhóm" };
const CMD: Record<Kind, number> = { user: 510, group: 511 };

export function createMissedMessageRequester(
  api: API,
  log: Logger,
  opts: { minIntervalMs: number; now?: () => number; random?: () => number },
): MissedMessageRequester {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // Lượt đang chạy của từng loại: số trang đã nhận, mã trang vừa xin, hẹn giờ chờ phản hồi
  const run: Record<Kind, { pages: number; lastId: string | null; waiting: ReturnType<typeof setTimeout> | null } | null> = {
    user: null,
    group: null,
  };

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  const ask = (kind: Kind, lastId: string | null) => {
    const r = run[kind];
    if (!r) return;
    try {
      if (lastId === null) api.listener.requestOldMessages(kind === "user" ? ThreadType.User : ThreadType.Group);
      else api.listener.sendWs({ version: 1, cmd: CMD[kind], subCmd: 1, data: { first: false, lastId, preIds: [] } });
      r.lastId = lastId;
      r.waiting = later(PAGE_TIMEOUT_MS, () => {
        log.warn({ kind, page: r.pages + 1 }, `Không nhận được trang lấy bù (${LABEL[kind]}) - dừng`);
        run[kind] = null;
      });
    } catch (err) {
      log.warn({ err }, `Xin bù tin lỡ (${LABEL[kind]}) thất bại`);
      run[kind] = null;
    }
  };

  const askReactions = (type: ThreadType) => {
    try {
      api.listener.requestOldReactions(type);
    } catch (err) {
      log.warn({ err }, "Xin bù cảm xúc lỡ thất bại");
    }
  };

  const begin = (kind: Kind) => {
    run[kind] = { pages: 0, lastId: null, waiting: null };
    ask(kind, null);
  };

  return {
    onConnected: () => {
      const sinceLast = now() - lastRequestAt;
      if (sinceLast < opts.minIntervalMs) {
        log.debug({ sinceLastMs: sinceLast }, "Vừa xin bù tin lỡ gần đây - lần nối lại này bỏ qua");
        return;
      }
      lastRequestAt = now();
      begin("user");
      later(2_000 + Math.floor(random() * 3_000), () => begin("group"));
      // Cảm xúc thả trong lúc tắt máy (cmd 610/611, trang đầu), sau phần tin vài giây: về `old_reactions`
      later(8_000 + Math.floor(random() * 3_000), () => askReactions(ThreadType.User));
      later(11_000 + Math.floor(random() * 3_000), () => askReactions(ThreadType.Group));
    },

    onPage: (page) => {
      const p = page as { threadType?: unknown; count?: unknown; meta?: Record<string, unknown> } | null;
      const kind: Kind = p?.threadType === ThreadType.Group ? "group" : "user";
      const r = run[kind];
      if (!r) return;
      if (r.waiting) {
        clearTimeout(r.waiting);
        timers.delete(r.waiting);
        r.waiting = null;
      }
      r.pages++;
      const nextId = p?.meta?.lastActionId;
      const more = p?.meta?.more === true || p?.meta?.more === 1;
      const next = typeof nextId === "string" || typeof nextId === "number" ? String(nextId) : null;
      log.info({ page: r.pages, count: p?.count, more }, `Đã nhận trang lấy bù (${LABEL[kind]})`);
      if (!more || !next || next === r.lastId || r.pages >= MAX_PAGES) {
        run[kind] = null;
        return;
      }
      later(2_000 + Math.floor(random() * 2_000), () => ask(kind, next));
    },

    stop: () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      run.user = null;
      run.group = null;
    },
  };
}
