import type { DatabaseSync } from "node:sqlite";

/**
 * Lấy lại file hỏng (thường là Zalo đã xóa khỏi máy chủ) từ một bản có sẵn trên máy - hiện là bản Zalo PC
 * đã tải về. Đính kèm lấy lại được đánh `done` như tải bình thường, kèm `recovered_from` cho biết nguồn.
 */
export type RecoveryCandidate = {
  id: number;
  kind: string;
  /** Mã tin Zalo (msgId) của tin chứa file */
  msgId: string;
  fileName: string | null;
  threadId: string;
  threadType: "user" | "group";
  senderId: string;
  isSelf: boolean;
  cliMsgId: string | null;
  /** Checksum MD5 Zalo ghi cho file đính kèm (`content.params.checksum`); null với loại khác */
  checksum: string | null;
  /** Cỡ file Zalo ghi trong tin (dò bản cùng tên + cỡ trong `Zalo Received Files`) */
  size: number | null;
};

function checksumOf(params: unknown): string | null {
  if (typeof params !== "string") return null;
  try {
    const v = (JSON.parse(params) as { checksum?: unknown } | null)?.checksum;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/** Đính kèm hỏng hẳn có thể có bản trên máy: ảnh, gif, video, file, tin thoại (bỏ sticker) */
export function failedAttachmentsForRecovery(db: DatabaseSync): RecoveryCandidate[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.kind, a.msg_id, a.file_name, COALESCE(a.declared_size, a.size_bytes) AS size, m.thread_id, m.thread_type, m.sender_id, m.is_self, m.cli_msg_id,
         CASE WHEN a.kind = 'file' AND json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.content.params') END AS params
       FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
       WHERE a.status = 'failed' AND a.kind IN ('photo', 'gif', 'video', 'file', 'voice')
       ORDER BY a.id`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    kind: String(r.kind),
    msgId: String(r.msg_id),
    fileName: (r.file_name as string | null) ?? null,
    threadId: String(r.thread_id),
    threadType: r.thread_type === "group" ? "group" : "user",
    senderId: String(r.sender_id),
    isSelf: Number(r.is_self) === 1,
    cliMsgId: (r.cli_msg_id as string | null) ?? null,
    checksum: checksumOf(r.params),
    size: typeof r.size === "number" && r.size > 0 ? r.size : null,
  }));
}

/** File lấy lại xong: như tải xong bình thường, ghi thêm nguồn. Chỉ đổi đính kèm còn đang hỏng. */
export function markAttachmentRecovered(
  db: DatabaseSync,
  id: number,
  saved: { localPath: string; sha256: string; sizeBytes: number; mime: string | null },
  source: string,
  nowIso: string,
): boolean {
  const r = db
    .prepare(
      `UPDATE attachments SET status = 'done', local_path = ?, sha256 = ?, size_bytes = ?, mime = ?, recovered_from = ?,
         needs_renew = 0, last_error = NULL, next_attempt_at = NULL, fetched_at = ?
       WHERE id = ? AND status = 'failed'`,
    )
    .run(saved.localPath, saved.sha256, saved.sizeBytes, saved.mime, source, nowIso, id);
  return Number(r.changes) > 0;
}
