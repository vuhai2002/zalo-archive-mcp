import type { DatabaseSync } from "node:sqlite";
import type { OutboxMode } from "./outbox-store.js";

/** Số liệu cho cổng gửi, đọc từ chính bảng outbox (nguồn sự thật bền, không có bộ đếm riêng để lệch) */

/**
 * Số lần đã THỬ gửi kể từ mốc (kể cả đang gửi và hỏng sau khi đã gọi Zalo),
 * để trần tính thận trọng: một lần gửi "hỏng" vẫn có thể đã tới người nhận.
 * Lọc được theo kiểu (chỉ đếm tin của lô) và theo người nhận.
 */
export function countSendAttemptsSince(
  db: DatabaseSync,
  sinceIso: string,
  filter: { mode?: OutboxMode; threadId?: string } = {},
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM outbox
       WHERE sending_started_at >= :since AND status IN ('sending', 'sent', 'failed')
         AND (:mode IS NULL OR mode = :mode)
         AND (:threadId IS NULL OR thread_id = :threadId)`,
    )
    .get({ since: sinceIso, mode: filter.mode ?? null, threadId: filter.threadId ?? null }) as { n: number };
  return Number(row.n);
}

/** Lần thử gửi gần nhất (mọi kiểu, hoặc chỉ một kiểu) */
export function lastSendAttemptAt(db: DatabaseSync, mode?: OutboxMode): string | null {
  const row = db
    .prepare("SELECT MAX(sending_started_at) AS at FROM outbox WHERE (:mode IS NULL OR mode = :mode)")
    .get({ mode: mode ?? null }) as { at: string | null };
  return row.at ?? null;
}
