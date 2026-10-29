import { ThreadType, type API } from "zca-js";
import type { Logger } from "pino";

/**
 * KHUNG - xin Zalo gửi lại tin lỡ trong lúc listener tắt (cmd 510 tin 1-1,
 * 511 tin nhóm). Tin trả về đi qua sự kiện `old_messages`, kho ghi với
 * `source = 'old_messages'` và khử trùng theo msg_id như mọi tin khác.
 *
 * Giới hạn đã biết (chờ số đo trên nick phụ, bật bằng OFFLINE_REPLAY_ENABLED):
 * - `requestOldMessages` của zca-js 2.2.0 luôn gửi `first: true` và sự kiện
 *   `old_messages` bỏ mất `lastActionId`/`more`, nên ở đây chỉ lấy được TRANG
 *   ĐẦU. Giao thức đúng (theo vibecodingengine đọc `doGetOffline` của Zalo Web):
 *   trang đầu `{first:true, lastId:"1"}`, trang sau `{first:false, lastId:<lastActionId>}`
 *   lặp khi `more`. Làm đủ cần gửi payload riêng qua `listener.sendWs()` (public)
 *   và đọc frame thô từ `(listener as any).ws` - để sau khi đo.
 * - Chưa biết lấy lại được bao xa (research: khoảng 2 tuần, hay thiếu).
 */
export function requestMissedMessages(api: API, log: Logger): void {
  try {
    api.listener.requestOldMessages(ThreadType.User);
    api.listener.requestOldMessages(ThreadType.Group);
    log.info("Đã xin lại tin lỡ (trang đầu, tin 1-1 + tin nhóm)");
  } catch (err) {
    log.warn({ err }, "Xin lại tin lỡ thất bại");
  }
}
