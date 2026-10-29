import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { applyReaction } from "../storage/message-reaction-store.js";
import { recordRecall, upsertMessage } from "../storage/message-write-store.js";
import { getMeta } from "../storage/thread-directory-store.js";
import { groupEventNotice, normalizeReaction } from "../zalo/normalize-reaction-and-group-event.js";
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
  | { kind: "undo"; undo: RawListenerMessage }
  // Ba loại dưới: payload nguyên văn của zca-js (Reaction / GroupEvent), nhật ký ghi y như vậy
  | { kind: "reaction"; reaction: unknown }
  | { kind: "old_reactions"; reactions: unknown[] }
  | { kind: "group_event"; event: unknown };

export type IngestStats = { stored: number; recalls: number; reactions: number; skipped: number };

const contactName = (db: DatabaseSync, uid: string) =>
  (db.prepare("SELECT display_name FROM contacts WHERE user_id = ?").get(uid) as { display_name: string | null } | undefined)?.display_name ?? null;
const groupName = (db: DatabaseSync, groupId: string) =>
  (db.prepare("SELECT name FROM threads WHERE thread_id = ? AND thread_type = 'group'").get(groupId) as { name: string | null } | undefined)?.name ?? null;

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
  const stats: IngestStats = { stored: 0, recalls: 0, reactions: 0, skipped: 0 };
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

  const storeReaction = (raw: unknown) => {
    try {
      const r = normalizeReaction(raw, receivedAt);
      if (!r) return void stats.skipped++;
      applyReaction(db, r);
      stats.reactions++;
    } catch (err) {
      stats.skipped++;
      log.error({ err }, "Không ghi được cảm xúc vào kho (vẫn còn trong nhật ký)");
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
    case "reaction":
      storeReaction(event.reaction);
      break;
    case "old_reactions":
      for (const r of event.reactions) storeReaction(r);
      break;
    case "group_event": {
      // Gọi TRƯỚC khi listener cập nhật tên nhóm: cần tên cũ để biết có đổi tên thật không
      const notice = groupEventNotice(event.event, {
        selfUid: getMeta(db, "self_uid"),
        nameOf: (uid) => contactName(db, uid),
        groupNameOf: (id) => groupName(db, id),
        receivedAt,
      });
      if (notice) {
        upsertMessage(db, notice, { source: sourceOverride ?? "live", receivedAt: receivedIso });
        stats.stored++;
      } else stats.skipped++;
      break;
    }
  }
  return stats;
}
