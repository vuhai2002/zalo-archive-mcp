import type { API } from "zca-js";
import { decodeWsEventData } from "./mobile-sync/zca-mobile-sync-apis.js";
import { attachRawWsFrameListener } from "./raw-ws-frame-listener.js";

/**
 * Sự kiện nhóm (thêm / rời / xóa / đổi tên...) lỡ lúc tắt máy nằm ở hàng chờ ĐIỀU KHIỂN của Zalo
 * (`603_0`), không ở hàng chờ tin nhắn. Zalo Web xin bù hàng chờ này mỗi lần kết nối như tin và cảm
 * xúc; zca-js không xin và bỏ qua phản hồi (cmd 603), nên kho đọc thẳng khung WS.
 *
 * Phản hồi như các hàng chờ khác (đã thử trên nick phụ): `data = { controls, more, lastActionId,
 * queueStatus }`, mỗi control giống sự kiện trực tiếp cmd 601 (`content.act_type`, `act`, `data`).
 * Chỉ lấy loại "group"; loại khác (kết bạn, hồ sơ, đồng bộ điện thoại, renew_link) có đường riêng
 * hoặc không cần nên bỏ qua. `join_reject` bỏ như zca-js (Zalo gửi kèm cả khi duyệt cho vào nhóm).
 */
export const CONTROLS_QUEUE = { cmd: 603, subCmd: 0 } as const;

/** Cùng hình dạng sự kiện nhóm zca-js phát (trừ `type`), để đi chung đường ghi với sự kiện trực tiếp */
export type ReplayedGroupEvent = { act: string; data: Record<string, unknown>; threadId: string; isSelf: boolean };
export type ControlsQueuePage = {
  events: ReplayedGroupEvent[];
  /** Số control trong trang (mọi loại) */
  count: number;
  meta: { lastActionId?: unknown; more?: unknown; queueStatus?: Record<string, { evict?: unknown } | undefined> };
};

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function parseData(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "string") return asObject(v);
  try {
    return asObject(JSON.parse(v));
  } catch {
    return null;
  }
}

/** Đọc một khung phản hồi cmd 603; khung không đọc được thì null */
export function parseControlsQueuePage(frame: Buffer, cipherKey: string | null, selfUid: string | null): ControlsQueuePage | null {
  const decoded = asObject(decodeWsEventData(JSON.parse(frame.subarray(4).toString("utf8")), cipherKey));
  const d = asObject(decoded?.data) ?? decoded;
  if (!d) return null;
  const controls = Array.isArray(d.controls) ? (d.controls as unknown[]) : [];
  const events: ReplayedGroupEvent[] = [];
  for (const control of controls) {
    const content = asObject(asObject(control)?.content);
    const act = content?.act;
    if (content?.act_type !== "group" || typeof act !== "string" || act === "join_reject") continue;
    const data = parseData(content.data);
    if (!data) continue;
    const threadId = String(data.groupId ?? data.group_id ?? "");
    events.push({ act, data, threadId, isSelf: !!selfUid && String(data.sourceId ?? "") === selfUid });
  }
  const queueStatus = asObject(d.queueStatus) as ControlsQueuePage["meta"]["queueStatus"] | null;
  return { events, count: controls.length, meta: { lastActionId: d.lastActionId, more: d.more, queueStatus: queueStatus ?? undefined } };
}

/** Nghe phản hồi hàng chờ điều khiển trên WS của listener. Trả hàm gỡ. */
export function attachControlsQueueListener(
  api: API,
  selfUid: () => string | null,
  onPage: (page: ControlsQueuePage) => void,
  onError: (err: unknown) => void,
): () => void {
  return attachRawWsFrameListener(
    api,
    CONTROLS_QUEUE,
    (frame, cipherKey) => {
      const page = parseControlsQueuePage(frame, cipherKey, selfUid());
      if (page) onPage(page);
    },
    onError,
  );
}
