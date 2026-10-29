import type { DatabaseSync } from "node:sqlite";

export type PendingAttachment = {
  id: number;
  msgId: string;
  kind: string;
  remoteUrl: string;
  fileName: string | null;
  attempts: number;
};

/**
 * Giành một file chờ tải: chuyển sang `downloading` NGAY trong cùng câu lệnh
 * nên không có hai vòng tải cùng lấy một file.
 */
export function claimNextAttachment(db: DatabaseSync, nowIso: string): PendingAttachment | null {
  const row = db
    .prepare(
      `UPDATE attachments SET status = 'downloading', attempts = attempts + 1
       WHERE id = (
         SELECT id FROM attachments
         WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY id LIMIT 1
       )
       RETURNING id, msg_id, kind, remote_url, file_name, attempts`,
    )
    .get(nowIso) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    msgId: String(row.msg_id),
    kind: String(row.kind),
    remoteUrl: String(row.remote_url),
    fileName: (row.file_name as string | null) ?? null,
    attempts: Number(row.attempts),
  };
}

export function markAttachmentDone(
  db: DatabaseSync,
  id: number,
  result: { localPath: string; sha256: string; sizeBytes: number; mime: string | null },
): void {
  db.prepare(
    `UPDATE attachments SET status = 'done', local_path = ?, sha256 = ?, size_bytes = ?, mime = ?,
       last_error = NULL, next_attempt_at = NULL, fetched_at = ?
     WHERE id = ?`,
  ).run(result.localPath, result.sha256, result.sizeBytes, result.mime, new Date().toISOString(), id);
}

/**
 * Ghi một lần tải hỏng. Còn lượt thì đưa về `pending` với mốc thử lại; hết
 * lượt (hoặc lỗi vĩnh viễn như quá cỡ, host lạ) thì đóng hẳn.
 */
export function markAttachmentFailed(
  db: DatabaseSync,
  id: number,
  opts: { error: string; finalStatus?: "failed" | "too_large" | "blocked_host"; retryAt?: string },
): void {
  const status = opts.finalStatus ?? (opts.retryAt ? "pending" : "failed");
  db.prepare("UPDATE attachments SET status = ?, last_error = ?, next_attempt_at = ? WHERE id = ?").run(
    status,
    opts.error.slice(0, 500),
    opts.retryAt ?? null,
    id,
  );
}

/**
 * Tiến trình chết giữa lúc tải để lại dòng `downloading` - trả về hàng đợi khi
 * khởi động. Dòng đã hết lượt thì đóng hẳn: một file làm sập tiến trình không
 * được thử lại vô hạn qua mỗi lần khởi động lại.
 */
export function resetStuckDownloads(db: DatabaseSync, maxAttempts: number): number {
  db.prepare(
    `UPDATE attachments SET status = 'failed', last_error = 'Tiến trình dừng giữa lúc tải, đã hết lượt thử'
     WHERE status = 'downloading' AND attempts >= ?`,
  ).run(maxAttempts);
  return Number(db.prepare("UPDATE attachments SET status = 'pending' WHERE status = 'downloading'").run().changes);
}

export function attachmentStatusCounts(db: DatabaseSync): Record<string, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM attachments GROUP BY status").all() as Array<{
    status: string;
    n: number;
  }>;
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export function getAttachment(db: DatabaseSync, id: number): Record<string, unknown> | null {
  return (
    (db
      .prepare(
        `SELECT a.id, a.msg_id, a.kind, a.status, a.file_name, a.local_path, a.size_bytes, a.mime, a.sha256,
           a.last_error, a.fetched_at, m.thread_id, m.sent_at
         FROM attachments a JOIN messages m ON m.msg_id = a.msg_id WHERE a.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined) ?? null
  );
}

/**
 * File từng bị chặn vì host lạ, nay host đã được thêm vào danh sách cho phép
 * (vd file Zalo ở dlfl.vn): đưa về hàng đợi tải lại từ đầu. Chạy lúc khởi động.
 */
export function requeueNowAllowedAttachments(db: DatabaseSync, isAllowed: (url: string) => boolean): number {
  const rows = db.prepare("SELECT id, remote_url FROM attachments WHERE status = 'blocked_host'").all() as Array<{
    id: number;
    remote_url: string;
  }>;
  const stmt = db.prepare(
    "UPDATE attachments SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = NULL WHERE id = ?",
  );
  let n = 0;
  for (const r of rows) {
    if (isAllowed(r.remote_url)) {
      stmt.run(r.id);
      n++;
    }
  }
  return n;
}

/**
 * Ảnh trên CDN Zalo hỏng hết lượt TRƯỚC khi kho biết thử bản JXL gốc: đưa về hàng đợi
 * để tải lại (lần này có thử JXL). Ảnh đã thử JXL rồi (lỗi có chữ "JXL") thì không xếp
 * lại nữa - tránh mỗi lần khởi động lại gọi CDN cho ảnh hỏng hẳn. Chạy lúc khởi động.
 */
export function requeueJxlRecoverablePhotos(db: DatabaseSync): number {
  const r = db
    .prepare(
      `UPDATE attachments SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = NULL
       WHERE status = 'failed' AND kind = 'photo' AND remote_url LIKE '%zdn.vn/jpg/%'
         AND (last_error IS NULL OR last_error NOT LIKE '%JXL%')`,
    )
    .run();
  return Number(r.changes);
}
