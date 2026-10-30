import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import type { AttachmentRow } from "./message-read-queries.js";

/**
 * Ảnh/video và file đã gửi trong một hội thoại, mới nhất trước - cho bảng "Thông tin hội thoại"
 * kiểu Zalo PC (lưới Ảnh/Video, danh sách File). Sticker và gif không tính là ảnh của hội thoại.
 */
export type SharedMediaKind = "visual" | "file";
export type SharedAttachmentRow = AttachmentRow & {
  sentAt: string;
  messageId: number;
  msgId: string;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
};

const KINDS: Record<SharedMediaKind, string> = { visual: "('photo', 'video')", file: "('file')" };

export function threadSharedMedia(
  db: DatabaseSync,
  q: { threadId: string; threadType: ThreadKind; kind: SharedMediaKind; limit: number; offset: number },
): { items: SharedAttachmentRow[]; total: number } {
  const where = `FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
    LEFT JOIN contacts c ON c.user_id = m.sender_id
    WHERE m.thread_id = :threadId AND m.thread_type = :threadType AND a.kind IN ${KINDS[q.kind]}`;
  const total = (db.prepare(`SELECT COUNT(*) AS n ${where}`).get({ threadId: q.threadId, threadType: q.threadType }) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.file_name, a.local_path, a.size_bytes, a.mime, a.needs_renew, a.renewed_at, a.sha256, m.sent_at,
         m.id AS message_id, m.msg_id, m.sender_id, m.is_self, c.avatar_url AS sender_avatar_url,
         COALESCE(c.alias, m.sender_name, c.display_name) AS sender_name
       ${where} ORDER BY m.sent_at DESC, a.id DESC LIMIT :limit OFFSET :offset`,
    )
    .all({ threadId: q.threadId, threadType: q.threadType, limit: q.limit, offset: q.offset }) as Array<Record<string, unknown>>;
  return {
    total,
    items: rows.map((a) => ({
      id: Number(a.id),
      kind: String(a.kind),
      status: String(a.status),
      fileName: (a.file_name as string | null) ?? null,
      localPath: (a.local_path as string | null) ?? null,
      sizeBytes: a.size_bytes === null ? null : Number(a.size_bytes),
      mime: (a.mime as string | null) ?? null,
      renewPending: Number(a.needs_renew) === 1,
      renewed: a.renewed_at !== null,
      sha256: (a.sha256 as string | null) ?? null,
      sentAt: String(a.sent_at),
      messageId: Number(a.message_id),
      msgId: String(a.msg_id),
      senderId: String(a.sender_id),
      senderName: (a.sender_name as string | null) ?? null,
      senderAvatarUrl: (a.sender_avatar_url as string | null) ?? null,
      isSelf: Number(a.is_self) === 1,
    })),
  };
}
