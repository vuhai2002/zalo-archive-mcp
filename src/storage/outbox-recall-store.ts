import type { DatabaseSync } from "node:sqlite";
import { toItem, type OutboxItem } from "./outbox-item-mapping.js";

/**
 * Yêu cầu thu hồi tin kho đã gửi. MCP / dashboard chỉ GHI yêu cầu; daemon (nơi duy nhất gọi Zalo) lấy ra và thu hồi.
 * Vòng đời trên một mục `sent`: recall_requested_at -> recalled_at | recall_error. Yêu cầu lại sau khi lỗi được.
 */

/** Ghi yêu cầu thu hồi; false khi mục không phải tin đã gửi, đã thu hồi, hoặc đang chờ thu hồi */
export function requestRecall(db: DatabaseSync, id: number, nowIso: string): boolean {
  const r = db
    .prepare(
      `UPDATE outbox SET recall_requested_at = ?, recall_error = NULL
       WHERE id = ? AND status = 'sent' AND recalled_at IS NULL
         AND (recall_requested_at IS NULL OR recall_error IS NOT NULL)`,
    )
    .run(nowIso, id);
  return Number(r.changes) > 0;
}

/** Yêu cầu thu hồi cũ nhất còn chờ daemon làm */
export function nextRecallRequest(db: DatabaseSync): OutboxItem | null {
  const row = db
    .prepare(
      `SELECT * FROM outbox WHERE recall_requested_at IS NOT NULL AND recalled_at IS NULL AND recall_error IS NULL
       ORDER BY recall_requested_at LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  return row ? toItem(row) : null;
}

export function markRecalled(db: DatabaseSync, id: number, nowIso: string): void {
  db.prepare("UPDATE outbox SET recalled_at = ?, recall_error = NULL WHERE id = ?").run(nowIso, id);
}

/** Đánh lỗi cho yêu cầu còn chờ (chưa thu hồi xong) - cũng dùng để bỏ yêu cầu khi hết giờ chờ */
export function markRecallFailed(db: DatabaseSync, id: number, error: string): boolean {
  const r = db
    .prepare("UPDATE outbox SET recall_error = ? WHERE id = ? AND recall_requested_at IS NOT NULL AND recalled_at IS NULL AND recall_error IS NULL")
    .run(error.slice(0, 500), id);
  return Number(r.changes) > 0;
}

/** Bản tin listener đã ghi cho tin kho gửi: Zalo cần mã tin phía client để thu hồi */
export function sentMessageRecord(db: DatabaseSync, msgId: string): { cliMsgId: string | null; recalledAt: string | null } | null {
  const row = db.prepare("SELECT cli_msg_id, recalled_at FROM messages WHERE msg_id = ? AND is_self = 1").get(msgId) as
    | { cli_msg_id: string | null; recalled_at: string | null }
    | undefined;
  return row ? { cliMsgId: row.cli_msg_id, recalledAt: row.recalled_at } : null;
}
