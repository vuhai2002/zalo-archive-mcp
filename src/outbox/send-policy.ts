import type { ThreadKind } from "../archive/archived-message-types.js";
import type { OutboxMode } from "../storage/outbox-store.js";
import type { SendSettings } from "../storage/send-settings-store.js";

/**
 * Cổng gửi: quyết định một tin ĐÃ DUYỆT có được gửi NGAY BÂY GIỜ không. Kiểm ở
 * LÚC GỬI, không tin trạng thái lúc soạn. Module thuần - caller đọc sẵn dữ kiện.
 *
 * Người dùng chốt (2026-10-28):
 * - Tin lẻ (`single`): thả cửa - chỉ kill switch + cách tin trước tối thiểu vài giây.
 * - Lô gửi nhiều người (`batch`): chỉ tới bạn bè, nhịp ngẫu nhiên giữa các tin của lô,
 *   khung giờ + trần ngày riêng của lô.
 *
 * Kết quả "wait":
 * - `global`: mọi tin đều phải chờ (kill switch, nhịp tối thiểu giữa hai tin bất kỳ).
 * - `item`: chỉ tin này chờ - caller dời riêng nó để tin khác (nhất là tin lẻ) đi trước.
 */
export type SendPolicyInput = {
  now: Date;
  localHour: number;
  killed: boolean;
  killReason: string | null;
  mode: OutboxMode;
  recipient: { threadType: ThreadKind; isFriend: boolean };
  /** Lần thử gửi gần nhất của MỌI kiểu, và riêng của lô */
  lastAttemptAt: Date | null;
  lastBatchAttemptAt: Date | null;
  /** Nhịp đã bốc ngẫu nhiên cho tin lô kế tiếp (ms) */
  batchGapMs: number;
  batchSentToday: number;
  settings: SendSettings;
  /** Mốc mở khung giờ lô kế tiếp và mốc mở khung ngày mai (ISO), caller tính theo múi giờ */
  nextBatchWindowOpenAt: string;
  tomorrowBatchWindowOpenAt: string;
};

export type SendDecision =
  | { action: "send" }
  | { action: "wait"; scope: "item" | "global"; retryAt: string; reason: string }
  | { action: "reject"; reason: string };

export function evaluateSendPolicy(i: SendPolicyInput): SendDecision {
  if (i.killed) {
    return { action: "wait", scope: "global", retryAt: plusMs(i.now, 60_000), reason: `kill switch đang khóa: ${i.killReason ?? ""}` };
  }

  if (i.mode === "batch") {
    if (i.recipient.threadType === "group" || !i.recipient.isFriend) {
      return { action: "reject", reason: "Gửi theo lô chỉ tới bạn bè (không nhóm); người nhận này không phải bạn bè (theo danh bạ gần nhất)." };
    }
    const s = i.settings;
    if (i.localHour < s.batchWindowStartHour || i.localHour >= s.batchWindowEndHour) {
      return {
        action: "wait",
        scope: "item",
        retryAt: i.nextBatchWindowOpenAt,
        reason: `lô chỉ gửi ${s.batchWindowStartHour}h-${s.batchWindowEndHour}h`,
      };
    }
    if (i.batchSentToday >= s.batchDailyCap) {
      return { action: "wait", scope: "item", retryAt: i.tomorrowBatchWindowOpenAt, reason: `lô đã đủ ${s.batchDailyCap} tin hôm nay` };
    }
    const batchReadyAt = (i.lastBatchAttemptAt?.getTime() ?? 0) + i.batchGapMs;
    if (batchReadyAt > i.now.getTime()) {
      return { action: "wait", scope: "item", retryAt: new Date(batchReadyAt).toISOString(), reason: "chờ nhịp giữa hai tin của lô" };
    }
  }

  // Mọi tin (lẻ lẫn lô) cách tin trước tối thiểu vài giây: không bắn liên thanh
  const readyAt = (i.lastAttemptAt?.getTime() ?? 0) + i.settings.singleMinGapSeconds * 1000;
  if (readyAt > i.now.getTime()) {
    return { action: "wait", scope: "global", retryAt: new Date(readyAt).toISOString(), reason: "chờ vài giây giữa hai tin" };
  }
  return { action: "send" };
}

function plusMs(d: Date, ms: number): string {
  return new Date(d.getTime() + ms).toISOString();
}

/** Bốc khoảng cách ngẫu nhiên giữa hai tin của lô, trong [min, max] giây */
export function randomGapMs(minSeconds: number, maxSeconds: number, random: () => number = Math.random): number {
  return Math.round((minSeconds + random() * (maxSeconds - minSeconds)) * 1000);
}
