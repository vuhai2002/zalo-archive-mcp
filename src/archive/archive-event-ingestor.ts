import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { recordRecall, upsertMessage } from "../storage/message-write-store.js";
import {
  isRecallPayload,
  normalizeMessage,
  normalizeRecall,
  type RawListenerMessage,
} from "../zalo/normalize-zalo-event.js";
import type { MessageSource } from "./archived-message-types.js";

/**
 * Sự kiện kho quan tâm, ở dạng ghi được vào nhật ký. Dùng chung cho listener
 * live và cho việc chạy lại nhật ký, để hai đường đi qua đúng một logic.
 */
export type ArchiveEvent =
  | { kind: "message"; message: RawListenerMessage }
  | { kind: "old_messages"; messages: RawListenerMessage[] }
  | { kind: "undo"; undo: RawListenerMessage };

export type IngestStats = { stored: number; recalls: number; skipped: number };

/**
 * Ghi một sự kiện vào kho. Lỗi của TỪNG tin được bắt riêng: một tin lạ không
 * được làm mất cả lô `old_messages` đi kèm.
 *
 * `sourceOverride` dùng khi chạy lại nhật ký: tin mới được thêm lúc đó ghi
 * `journal_replay` cho trung thực (tin đã có thì giữ nguồn cũ).
 */
export function ingestArchiveEvent(
  db: DatabaseSync,
  event: ArchiveEvent,
  receivedAt: Date,
  log: Logger,
  sourceOverride?: MessageSource,
): IngestStats {
  const stats: IngestStats = { stored: 0, recalls: 0, skipped: 0 };
  const receivedIso = receivedAt.toISOString();

  const storeOne = (raw: RawListenerMessage, source: MessageSource) => {
    try {
      if (isRecallPayload(raw.data)) {
        const recall = normalizeRecall(raw, receivedAt);
        if (recall) {
          recordRecall(db, recall);
          stats.recalls++;
        } else stats.skipped++;
        return;
      }
      const msg = normalizeMessage(raw, receivedAt);
      if (!msg) {
        stats.skipped++;
        log.warn({ threadId: raw.threadId }, "Bỏ qua tin thiếu msgId");
        return;
      }
      upsertMessage(db, msg, { source: sourceOverride ?? source, receivedAt: receivedIso });
      stats.stored++;
    } catch (err) {
      stats.skipped++;
      log.error({ err, threadId: raw.threadId, msgId: raw.data?.msgId }, "Không ghi được tin vào kho (vẫn còn trong nhật ký)");
    }
  };

  switch (event.kind) {
    case "message":
      storeOne(event.message, "live");
      break;
    case "undo":
      storeOne(event.undo, "live");
      break;
    case "old_messages":
      for (const m of event.messages) storeOne(m, "old_messages");
      break;
  }
  return stats;
}
