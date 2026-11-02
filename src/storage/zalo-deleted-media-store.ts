import type { DatabaseSync } from "node:sqlite";

/**
 * Zalo xóa file cũ khỏi máy chủ (ảnh: đo được sau khoảng 2 tuần): link hết hạn và lệnh xin lại link
 * bị từ chối mã 1001. Đồng bộ điện thoại có thể ra rất nhiều file như vậy; xin lại từng file vừa
 * vô ích vừa chiếm hết lượt xin lại (trần ngày) của file mới hơn còn cứu được.
 *
 * Suy từ chính kết quả đã có, theo từng loại file (ảnh, video, file): coi là Zalo đã xóa khi Zalo đã
 * từ chối ít nhất `REFUSALS_TO_TRUST` lần cho file cùng loại gửi CÙNG LÚC HOẶC SAU file này (file mới
 * hơn đã bị xóa thì file cũ hơn cũng vậy), và 7 ngày qua chưa xin lại thành công lần nào cho file cùng
 * loại gửi cùng lúc hoặc trước nó. Không có số liệu chính thức nào về thời gian Zalo giữ file.
 */

/** Đoạn chữ Zalo dùng khi từ chối cấp lại link (ghi trong `last_error` lúc xin lại hỏng) */
export const ZALO_REFUSED_RENEW_ERROR = "mã lỗi 1001";
export const DELETED_BY_ZALO_ERROR = "Zalo đã xóa file cũ khỏi máy chủ - không xin lại link được";
const REFUSALS_TO_TRUST = 3;
const SUCCESS_LOOKBACK_MS = 7 * 86_400_000;

export function isDeletedByZalo(db: DatabaseSync, attachmentId: number, now: Date): boolean {
  const target = db
    .prepare("SELECT a.kind, m.sent_at FROM attachments a JOIN messages m ON m.msg_id = a.msg_id WHERE a.id = ?")
    .get(attachmentId) as { kind: string; sent_at: string } | undefined;
  if (!target) return false;
  const refused = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
         WHERE a.kind = ? AND m.sent_at >= ? AND a.status = 'failed' AND a.renewed_at IS NOT NULL
           AND a.original_url IS NULL AND instr(a.last_error, ?) > 0
         LIMIT ${REFUSALS_TO_TRUST})`,
    )
    .get(target.kind, target.sent_at, ZALO_REFUSED_RENEW_ERROR) as { n: number };
  if (refused.n < REFUSALS_TO_TRUST) return false;
  // `original_url` chỉ có khi Zalo đã cấp link mới: file cũ hơn mà gần đây còn xin lại được thì cứ thử
  const recentSuccess = db
    .prepare(
      `SELECT 1 FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
       WHERE a.kind = ? AND m.sent_at <= ? AND a.original_url IS NOT NULL AND a.renewed_at >= ? LIMIT 1`,
    )
    .get(target.kind, target.sent_at, new Date(now.getTime() - SUCCESS_LOOKBACK_MS).toISOString());
  return !recentSuccess;
}

/**
 * Trước khi tải: file của tin cũ hơn `minAgeDays` ngày mà quy tắc trên đã coi là Zalo xóa thì khỏi gọi máy chủ.
 * Máy chủ Zalo gần như không còn trả file cũ quá vài tuần; đồng bộ toàn bộ lịch sử mà vẫn thử từng file thì mất nhiều ngày gọi vô ích, file của tin mới
 * phải xếp sau. Loại file chưa từng bị Zalo từ chối (vd sticker) thì vẫn tải như thường.
 */
export function isOldFileDeletedByZalo(db: DatabaseSync, attachmentId: number, now: Date, minAgeDays: number): boolean {
  const row = db
    .prepare("SELECT m.sent_at FROM attachments a JOIN messages m ON m.msg_id = a.msg_id WHERE a.id = ?")
    .get(attachmentId) as { sent_at: string } | undefined;
  if (!row || Date.parse(row.sent_at) > now.getTime() - minAgeDays * 86_400_000) return false;
  return isDeletedByZalo(db, attachmentId, now);
}

/** Đóng hẳn file Zalo đã xóa, không gọi Zalo (đánh `renewed_at` để lúc khởi động không xếp lại) */
export function markAttachmentDeletedByZalo(db: DatabaseSync, id: number, now: Date): void {
  db.prepare(
    `UPDATE attachments SET status = 'failed', needs_renew = 0, renewed_at = ?, last_error = ?, next_attempt_at = NULL
     WHERE id = ?`,
  ).run(now.toISOString(), DELETED_BY_ZALO_ERROR, id);
}

/** File đang chờ lượt xin lại link mà nay đã rõ là Zalo xóa: đóng luôn, khỏi chờ tới lượt. Trả số file. */
export function closeQueuedRenewalsDeletedByZalo(db: DatabaseSync, now: Date): number {
  const queued = db
    .prepare("SELECT id FROM attachments WHERE status = 'pending' AND needs_renew = 1 AND renewed_at IS NULL")
    .all() as Array<{ id: number }>;
  let n = 0;
  for (const { id } of queued) {
    if (!isDeletedByZalo(db, id, now)) continue;
    markAttachmentDeletedByZalo(db, id, now);
    n++;
  }
  return n;
}

/** File hỏng hẳn vì Zalo đã xóa khỏi máy chủ: kho đóng luôn, hoặc Zalo từ chối cấp lại link (mã 1001) */
export function isZaloDeletedFailure(status: string, lastError: string | null): boolean {
  return status === "failed" && !!lastError && (lastError === DELETED_BY_ZALO_ERROR || lastError.includes(ZALO_REFUSED_RENEW_ERROR));
}
