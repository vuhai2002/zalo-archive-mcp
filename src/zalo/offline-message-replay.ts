import { ThreadType, type API } from "zca-js";
import type { Logger } from "pino";

/**
 * Xin Zalo gửi lại tin lỡ trong lúc listener tắt (tắt máy, đang dùng nick khác):
 * cmd 510 tin 1-1, 511 tin nhóm. Tin trả về đi qua sự kiện `old_messages`, kho ghi
 * với `source = 'old_messages'` và khử trùng theo msg_id như mọi tin khác.
 *
 * Giữ nhịp như Zalo Web, không dồn dập:
 * - mỗi lần kết nối xin MỘT lượt; nối lại trong vòng `minIntervalMs` kể từ lượt
 *   trước (mạng chập chờn) thì không xin lại;
 * - tin 1-1 trước, tin nhóm sau vài giây ngẫu nhiên.
 *
 * Giới hạn đã biết:
 * - `requestOldMessages` của zca-js 2.2.0 luôn gửi `first: true` và sự kiện
 *   `old_messages` bỏ mất `lastActionId`/`more`, nên chỉ lấy được TRANG ĐẦU. Giao
 *   thức đúng (theo vibecodingengine đọc `doGetOffline` của Zalo Web): trang đầu
 *   `{first:true, lastId:"1"}`, trang sau `{first:false, lastId:<lastActionId>}` lặp
 *   khi `more`. Làm đủ cần gửi payload riêng qua `listener.sendWs()` và đọc frame thô.
 * - Zalo chỉ giữ khoảng 2 tuần gần nhất, và có khi thiếu (research).
 */
export type MissedMessageRequester = { onConnected: () => void; stop: () => void };

export function createMissedMessageRequester(
  api: API,
  log: Logger,
  opts: { minIntervalMs: number; now?: () => number; random?: () => number },
): MissedMessageRequester {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let groupTimer: ReturnType<typeof setTimeout> | null = null;

  const request = (type: ThreadType, label: string) => {
    try {
      api.listener.requestOldMessages(type);
      log.info(`Đã xin Zalo gửi bù tin lỡ (${label})`);
    } catch (err) {
      log.warn({ err }, `Xin bù tin lỡ (${label}) thất bại`);
    }
  };

  return {
    onConnected: () => {
      const sinceLast = now() - lastRequestAt;
      if (sinceLast < opts.minIntervalMs) {
        log.debug({ sinceLastMs: sinceLast }, "Vừa xin bù tin lỡ gần đây - lần nối lại này bỏ qua");
        return;
      }
      lastRequestAt = now();
      request(ThreadType.User, "tin 1-1");
      if (groupTimer) clearTimeout(groupTimer);
      groupTimer = setTimeout(
        () => {
          groupTimer = null;
          request(ThreadType.Group, "tin nhóm");
        },
        2_000 + Math.floor(random() * 3_000),
      );
    },
    stop: () => {
      if (groupTimer) clearTimeout(groupTimer);
      groupTimer = null;
    },
  };
}
