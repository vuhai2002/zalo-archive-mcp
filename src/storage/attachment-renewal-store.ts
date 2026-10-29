import type { DatabaseSync } from "node:sqlite";

/**
 * Trạng thái "xin lại link" của file đính kèm (cột needs_renew / renewed_at / original_url).
 * Mỗi file chỉ được xin tự động một lần: `renewed_at` khác NULL là đã xin rồi.
 */

/** Đưa file vào hàng đợi với cờ xin lại link, tới mốc `slotIso` mới được giành */
export function scheduleAttachmentRenewal(db: DatabaseSync, id: number, opts: { slotIso: string; error: string }): void {
  db.prepare(
    `UPDATE attachments SET status = 'pending', needs_renew = 1, attempts = 0, next_attempt_at = ?, last_error = ?
     WHERE id = ?`,
  ).run(opts.slotIso, opts.error.slice(0, 500), id);
}

/** Zalo đã cấp link mới: tải bằng link mới, giữ link gốc */
export function recordAttachmentRenewed(db: DatabaseSync, id: number, newUrl: string, nowIso: string): void {
  db.prepare(
    `UPDATE attachments SET original_url = COALESCE(original_url, remote_url), remote_url = ?, renewed_at = ?,
       needs_renew = 0
     WHERE id = ?`,
  ).run(newUrl, nowIso, id);
}

/** Xin lại không được: đóng hẳn, không xếp lại lần nào nữa (trừ khi người dùng bấm Thử lại) */
export function markAttachmentRenewFailed(db: DatabaseSync, id: number, error: string, nowIso: string): void {
  db.prepare(
    `UPDATE attachments SET status = 'failed', needs_renew = 0, renewed_at = ?, last_error = ?, next_attempt_at = NULL
     WHERE id = ?`,
  ).run(nowIso, error.slice(0, 500), id);
}

export type AttachmentRenewContext = {
  kind: string;
  remoteUrl: string;
  originalUrl: string | null;
  threadId: string;
  threadType: "user" | "group";
  rawJson: string;
};

/** Những gì lời gọi renewlink cần: hội thoại, loại file, payload gốc */
export function getAttachmentRenewContext(db: DatabaseSync, id: number): AttachmentRenewContext | null {
  const r = db
    .prepare(
      `SELECT a.kind, a.remote_url, a.original_url, m.thread_id, m.thread_type, m.raw_json
       FROM attachments a JOIN messages m ON m.msg_id = a.msg_id WHERE a.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    kind: String(r.kind),
    remoteUrl: String(r.remote_url),
    originalUrl: (r.original_url as string | null) ?? null,
    threadId: String(r.thread_id),
    threadType: r.thread_type === "group" ? "group" : "user",
    rawJson: String(r.raw_json),
  };
}

/** Lỗi tải mà kho coi là link hết hạn (ghi bởi download-to-file) */
export const EXPIRED_LINK_ERROR = /^HTTP (403|404|410)\b|Link hết hạn/;

/**
 * File hỏng hẳn vì link hết hạn TRƯỚC khi kho biết xin lại link: xếp vào hàng xin lại, mỗi
 * file một lượt do `allocate` cấp (đã giãn nhịp + trần ngày). Chạy lúc khởi động.
 */
export function requeueExpiredForRenewal(db: DatabaseSync, allocate: () => string): number {
  const rows = db
    .prepare("SELECT id, last_error FROM attachments WHERE status = 'failed' AND renewed_at IS NULL ORDER BY id")
    .all() as Array<{ id: number; last_error: string | null }>;
  let n = 0;
  for (const r of rows) {
    if (!r.last_error || !EXPIRED_LINK_ERROR.test(r.last_error)) continue;
    scheduleAttachmentRenewal(db, r.id, { slotIso: allocate(), error: r.last_error });
    n++;
  }
  return n;
}

/**
 * Người dùng bấm "Thử lại" trên file hỏng: xin lại link rồi tải ngay (kể cả file đã xin một
 * lần). Trả false nếu file không ở trạng thái hỏng.
 */
export function requestAttachmentRetry(db: DatabaseSync, id: number, nowIso: string): boolean {
  const r = db
    .prepare(
      `UPDATE attachments SET status = 'pending', needs_renew = 1, attempts = 0, next_attempt_at = ?, renewed_at = NULL
       WHERE id = ? AND status = 'failed'`,
    )
    .run(nowIso, id);
  return Number(r.changes) > 0;
}
