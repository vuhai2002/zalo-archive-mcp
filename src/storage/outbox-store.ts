import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { toItem, type OutboxCreator, type OutboxItem, type OutboxMention, type OutboxMode, type OutboxReplyQuote, type OutboxStatus } from "./outbox-item-mapping.js";

/**
 * Hàng đợi gửi. Vòng đời:
 *   draft -> approved -> sending -> sent | failed
 *   draft -> rejected | cancelled;  approved -> cancelled
 *
 * Mọi đường gửi (MCP, dashboard, CLI) chỉ GHI vào đây; daemon là nơi duy nhất gọi Zalo.
 * Gửi ngay / hẹn giờ = tạo thẳng `approved`; nháp = `draft` chờ người dùng duyệt.
 * Mọi chuyển trạng thái là UPDATE có điều kiện trạng thái cũ, nên hai tiến trình
 * (MCP hủy, daemon gửi) không giẫm lên nhau.
 */
export type { OutboxCreator, OutboxItem, OutboxMention, OutboxMode, OutboxReplyQuote, OutboxStatus } from "./outbox-item-mapping.js";

export type NewOutboxItem = {
  threadId: string;
  threadType: ThreadKind;
  text: string;
  mode: OutboxMode;
  notBefore: string | null;
  batchId: string | null;
  createdBy: OutboxCreator;
  note: string | null;
  /** `approved` = gửi (ngay hoặc theo not_before); `draft` = chờ người dùng duyệt */
  status: "draft" | "approved";
  /** Nhắc tên (@) trong tin gửi vào nhóm */
  mentions?: OutboxMention[];
  /** Trả lời một tin (ô trích dẫn) */
  replyTo?: OutboxReplyQuote | null;
};

export function enqueueOutboxItem(db: DatabaseSync, d: NewOutboxItem): number {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO outbox (thread_id, thread_type, text, mode, batch_id, not_before, status, created_by, note,
         created_at, approved_at, mentions_json, reply_quote_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      d.threadId,
      d.threadType,
      d.text,
      d.mode,
      d.batchId,
      d.notBefore,
      d.status,
      d.createdBy,
      d.note,
      now,
      d.status === "approved" ? now : null,
      d.mentions?.length ? JSON.stringify(d.mentions) : null,
      d.replyTo ? JSON.stringify(d.replyTo) : null,
    ) as { id: number };
  return Number(row.id);
}

export function getOutboxItem(db: DatabaseSync, id: number): OutboxItem | null {
  const row = db.prepare("SELECT * FROM outbox WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toItem(row) : null;
}

export function listOutbox(db: DatabaseSync, opts: { statuses?: OutboxStatus[]; limit: number }): OutboxItem[] {
  const statuses = opts.statuses?.length ? opts.statuses : null;
  const rows = db
    .prepare(
      `SELECT * FROM outbox
       WHERE (:all = 1 OR status IN (SELECT value FROM json_each(:statuses)))
       ORDER BY id DESC LIMIT :limit`,
    )
    .all({ all: statuses ? 0 : 1, statuses: JSON.stringify(statuses ?? []), limit: opts.limit }) as Array<
    Record<string, unknown>
  >;
  return rows.map(toItem);
}

/** Chuyển trạng thái có điều kiện. Trả false nếu mục không còn ở trạng thái `from`. */
function transition(
  db: DatabaseSync,
  id: number,
  from: OutboxStatus[],
  to: OutboxStatus,
  extra: { column?: "approved_at" | "finished_at"; error?: string | null } = {},
): boolean {
  const now = new Date().toISOString();
  const setTime = extra.column ? `, ${extra.column} = :now` : "";
  const setError = extra.error !== undefined ? ", error = :error" : "";
  const result = db
    .prepare(
      `UPDATE outbox SET status = :to${setTime}${setError}
       WHERE id = :id AND status IN (SELECT value FROM json_each(:from))`,
    )
    .run({
      to,
      id,
      from: JSON.stringify(from),
      ...(extra.column ? { now } : {}),
      ...(extra.error !== undefined ? { error: extra.error } : {}),
    });
  return Number(result.changes) === 1;
}

export const approveDraft = (db: DatabaseSync, id: number) =>
  transition(db, id, ["draft"], "approved", { column: "approved_at" });
export const rejectDraft = (db: DatabaseSync, id: number) =>
  transition(db, id, ["draft"], "rejected", { column: "finished_at" });
export const cancelOutboxItem = (db: DatabaseSync, id: number) =>
  transition(db, id, ["draft", "approved"], "cancelled", { column: "finished_at" });

/** Mục đã duyệt tới hạn gửi sớm nhất (chưa giành). Mốc hiệu lực = mốc dời nếu có, không thì giờ hẹn. */
export function peekNextDue(db: DatabaseSync, nowIso: string): OutboxItem | null {
  const row = db
    .prepare(
      `SELECT * FROM outbox WHERE status = 'approved' AND COALESCE(deferred_until, not_before, '') <= ?
       ORDER BY COALESCE(deferred_until, not_before, approved_at), id LIMIT 1`,
    )
    .get(nowIso) as Record<string, unknown> | undefined;
  return row ? toItem(row) : null;
}

/**
 * Dời riêng một mục đã duyệt tới mốc sau (vd lô ngoài khung giờ, đủ trần ngày).
 * Ghi vào `deferred_until`, KHÔNG sửa `not_before`: giờ dự kiến gốc giữ nguyên để
 * vòng gửi tính được tin đã trễ bao lâu và bỏ tin quá muộn.
 */
export function deferApprovedItem(db: DatabaseSync, id: number, until: string): boolean {
  const r = db.prepare("UPDATE outbox SET deferred_until = ? WHERE id = ? AND status = 'approved'").run(until, id);
  return Number(r.changes) === 1;
}

/** Giành mục để gửi; false nếu người dùng vừa hủy */
export function claimForSending(db: DatabaseSync, id: number, nowIso: string = new Date().toISOString()): boolean {
  const r = db
    .prepare(
      `UPDATE outbox SET status = 'sending', sending_started_at = ?, attempts = attempts + 1
       WHERE id = ? AND status = 'approved'`,
    )
    .run(nowIso, id);
  return Number(r.changes) === 1;
}

/**
 * Trả mục `sending` về `approved` khi bị chặn TRƯỚC lúc gọi Zalo (an toàn vì
 * Zalo chưa nhận gì). Xóa mốc bắt đầu gửi để lần chặn này không tính vào trần.
 */
export function revertSendingToApproved(db: DatabaseSync, id: number): boolean {
  const r = db
    .prepare(
      `UPDATE outbox SET status = 'approved', sending_started_at = NULL, attempts = MAX(attempts - 1, 0)
       WHERE id = ? AND status = 'sending'`,
    )
    .run(id);
  return Number(r.changes) === 1;
}

export function markSent(db: DatabaseSync, id: number, sentMsgId: string | null): void {
  db.prepare("UPDATE outbox SET status = 'sent', sent_msg_id = ?, finished_at = ? WHERE id = ? AND status = 'sending'").run(
    sentMsgId,
    new Date().toISOString(),
    id,
  );
}

export const markSendFailed = (db: DatabaseSync, id: number, error: string) =>
  transition(db, id, ["sending", "approved"], "failed", { column: "finished_at", error: error.slice(0, 1000) });

/**
 * Tiến trình chết giữa lúc gửi: KHÔNG biết tin đã đi hay chưa. Đánh `failed`
 * chứ không đưa về `approved` - gửi lại mù có thể gửi hai lần trên nick chính.
 */
export function failStuckSending(db: DatabaseSync): number {
  const r = db
    .prepare(
      `UPDATE outbox SET status = 'failed', finished_at = ?,
         error = 'Tiến trình dừng giữa lúc gửi, không rõ tin đã đi chưa. Không tự gửi lại; kiểm tra trên điện thoại.'
       WHERE status = 'sending'`,
    )
    .run(new Date().toISOString());
  return Number(r.changes);
}
