import type { DatabaseSync } from "node:sqlite";

/**
 * Trạng thái "xin lại link" của file đính kèm (cột needs_renew / renewed_at / original_url).
 * Mỗi file chỉ được xin tự động một lần: `renewed_at` khác NULL là đã xin rồi.
 */

/** Đóng file mà Zalo không cấp lại link cho loại của nó - kho không gọi Zalo cho file này */
export const UNRENEWABLE_KIND_ERROR = "Link hết hạn, Zalo không cấp lại link cho loại file này";

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
 * file một lượt do `allocate` cấp (đã giãn nhịp + trần ngày). `skip` trả true cho file không cần
 * xếp (vd Zalo đã xóa - nơi gọi tự đóng file đó; loại Zalo không cấp lại link). Chạy lúc khởi động.
 */
export function requeueExpiredForRenewal(
  db: DatabaseSync,
  allocate: () => string,
  skip: (id: number, kind: string) => boolean = () => false,
): number {
  const rows = db
    .prepare("SELECT id, kind, last_error FROM attachments WHERE status = 'failed' AND renewed_at IS NULL ORDER BY id")
    .all() as Array<{ id: number; kind: string; last_error: string | null }>;
  let n = 0;
  for (const r of rows) {
    if (!r.last_error || !EXPIRED_LINK_ERROR.test(r.last_error) || skip(r.id, r.kind)) continue;
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

/** File đang chờ lượt xin lại link (tự động, chưa xin lần nào), tin mới nhất trước: file mới dễ cứu hơn */
export function queuedRenewalsNewestFirst(db: DatabaseSync): number[] {
  const rows = db
    .prepare(
      `SELECT a.id FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
       WHERE a.status = 'pending' AND a.needs_renew = 1 AND a.renewed_at IS NULL
       ORDER BY m.sent_at DESC, a.id DESC`,
    )
    .all() as Array<{ id: number }>;
  return rows.map((r) => r.id);
}

/** Đổi mốc lượt xin lại link của một file đang chờ */
export function rescheduleRenewal(db: DatabaseSync, id: number, slotIso: string): void {
  db.prepare("UPDATE attachments SET next_attempt_at = ? WHERE id = ?").run(slotIso, id);
}

/**
 * File đang chờ lượt xin lại link mà loại của nó không nằm trong `renewableKinds` (tin thoại, gif...):
 * đóng luôn, trả lại lượt. Trả số file vừa đóng.
 */
export function closeQueuedUnrenewable(db: DatabaseSync, renewableKinds: readonly string[], nowIso: string): number {
  const r = db
    .prepare(
      `UPDATE attachments SET status = 'failed', needs_renew = 0, renewed_at = ?, last_error = ?, next_attempt_at = NULL
       WHERE status = 'pending' AND needs_renew = 1 AND kind NOT IN (${renewableKinds.map(() => "?").join(", ")})`,
    )
    .run(nowIso, UNRENEWABLE_KIND_ERROR, ...renewableKinds);
  return Number(r.changes);
}

/** Số lệnh xin lại link đã gửi Zalo từ `sinceIso` (thành công hay không; trừ file đóng vì `skipErrors` mà không gọi) */
export function renewCallsSince(db: DatabaseSync, sinceIso: string, skipErrors: readonly string[]): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n FROM attachments
       WHERE renewed_at >= ? AND (last_error IS NULL OR last_error NOT IN (${skipErrors.map(() => "?").join(", ")}))`,
    )
    .get(sinceIso, ...skipErrors) as { n: number };
  return r.n;
}
