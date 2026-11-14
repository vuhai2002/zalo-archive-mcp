import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { localHour, localHourTomorrowUtc, nextLocalHourUtc, startOfTodayUtc } from "../shared/local-date-range.js";
import { countSendAttemptsSince, lastSendAttemptAt } from "../storage/outbox-send-stats-store.js";
import type { OutboxItem } from "../storage/outbox-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import type { SendSettings } from "../storage/send-settings-store.js";
import type { SendPolicyInput } from "./send-policy.js";

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

/** Đọc mọi dữ kiện cổng gửi cần cho MỘT mục, tại thời điểm `now` */
export function gatherSendPolicyInput(
  db: DatabaseSync,
  env: AppEnv,
  settings: SendSettings,
  item: OutboxItem,
  now: Date,
  batchGapMs: number,
): SendPolicyInput {
  const kill = getKillSwitch(db);
  const tz = env.ARCHIVE_TIMEZONE;
  return {
    now,
    localHour: localHour(tz, now),
    killed: kill.killed,
    killReason: kill.reason,
    mode: item.mode,
    recipient: { threadType: item.threadType },
    lastAttemptAt: toDate(lastSendAttemptAt(db)),
    lastBatchAttemptAt: toDate(lastSendAttemptAt(db, "batch")),
    batchGapMs,
    batchSentToday: countSendAttemptsSince(db, startOfTodayUtc(tz, now), { mode: "batch" }),
    settings,
    nextBatchWindowOpenAt: nextLocalHourUtc(tz, settings.batchWindowStartHour, now),
    tomorrowBatchWindowOpenAt: localHourTomorrowUtc(tz, settings.batchWindowStartHour, now),
  };
}

/**
 * Kiểm lại NGAY TRƯỚC khi gọi Zalo (sau khoảng "đang soạn" vài giây): người
 * dùng có thể vừa bấm khóa, hoặc listener vừa rớt. Với lô còn kiểm lại khung
 * giờ. Không kiểm trần/nhịp vì mục này đã được tính là một lần thử.
 * Trả lý do chặn, hoặc null nếu vẫn được gửi.
 */
export function blockReasonBeforeSend(
  db: DatabaseSync,
  env: AppEnv,
  settings: SendSettings,
  item: OutboxItem,
  now: Date,
  listenerConnected: boolean,
): string | null {
  const kill = getKillSwitch(db);
  if (kill.killed) return `kill switch vừa bật: ${kill.reason ?? ""}`;
  if (!listenerConnected) return "listener vừa rớt";
  if (item.mode === "batch") {
    if (item.threadType === "group") return "lô không gửi vào nhóm";
    const hour = localHour(env.ARCHIVE_TIMEZONE, now);
    if (hour < settings.batchWindowStartHour || hour >= settings.batchWindowEndHour) return "vừa ra ngoài khung giờ của lô";
  }
  return null;
}
