import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";
import { getMeta } from "./thread-directory-store.js";

/**
 * "My Documents" của Zalo: hội thoại riêng để cất đồ của mình (mã `loginInfo.send2me_id`, KHÔNG phải hội
 * thoại với chính mình). Người dùng chốt 03/11/2026: tin xóa ở đây (Zalo đồng bộ lệnh "xóa ở phía tôi",
 * `chat.delete`) thì kho xóa hẳn, không giữ - khác các hội thoại khác, nơi kho vẫn giữ tin đã xóa. Mã tin
 * đã xóa được ghi nhớ (`deleted_messages`) để lấy bù / đồng bộ điện thoại sau không đưa tin đó vào lại.
 */
export const MY_DOCUMENTS_META_KEY = "my_documents_thread_id";

/** Mã hội thoại My Documents: lưu lúc đăng nhập; chưa có thì nhận theo ảnh thư mục Zalo trả trong hồ sơ */
export function myDocumentsThreadId(db: DatabaseSync): string | null {
  const saved = getMeta(db, MY_DOCUMENTS_META_KEY);
  if (saved) return saved;
  const row = db.prepare("SELECT user_id FROM contacts WHERE avatar_url LIKE '%zds_cic_my_documents%' LIMIT 1").get() as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}

/** Tin này đã bị xóa hẳn (không ghi lại vào kho) */
export function isDeletedMessage(db: DatabaseSync, msgId: string): boolean {
  return !!db.prepare("SELECT 1 FROM deleted_messages WHERE msg_id = ?").get(msgId);
}

/**
 * Xóa hẳn các tin của hội thoại `threadId` (cả đính kèm, cảm xúc, chỉ mục tìm kiếm) và ghi nhớ mã tin.
 * Chỉ đụng tin thuộc đúng hội thoại đó. Trả số tin đã xóa và file media (đường dẫn trong thư mục media)
 * không còn tin nào dùng - nơi gọi xóa file.
 */
export function deleteMessagesForGood(
  db: DatabaseSync,
  threadId: string,
  msgIds: readonly string[],
  nowIso: string,
): { deleted: number; orphanFiles: string[] } {
  return inTransaction(db, () => {
    const remember = db.prepare("INSERT OR IGNORE INTO deleted_messages (msg_id, thread_id, deleted_at) VALUES (?, ?, ?)");
    const find = db.prepare("SELECT id FROM messages WHERE msg_id = ? AND thread_id = ?");
    const files = db.prepare("SELECT local_path FROM attachments WHERE msg_id = ? AND local_path IS NOT NULL");
    const freed = new Set<string>();
    let deleted = 0;
    for (const msgId of new Set(msgIds)) {
      remember.run(msgId, threadId, nowIso);
      const row = find.get(msgId, threadId) as { id: number } | undefined;
      if (!row) continue;
      for (const f of files.all(msgId) as Array<{ local_path: string }>) freed.add(f.local_path);
      db.prepare("DELETE FROM attachments WHERE msg_id = ?").run(msgId);
      db.prepare("DELETE FROM message_reaction_taps WHERE msg_id = ?").run(msgId);
      db.prepare("DELETE FROM message_recalls WHERE msg_id = ?").run(msgId);
      db.prepare("DELETE FROM messages_fts WHERE rowid = ?").run(row.id);
      db.prepare("DELETE FROM messages WHERE id = ?").run(row.id);
      deleted++;
    }
    // File khử trùng theo nội dung: tin khác (hội thoại khác) có thể dùng chung file này
    const stillUsed = db.prepare("SELECT 1 FROM attachments WHERE local_path = ? LIMIT 1");
    return { deleted, orphanFiles: [...freed].filter((f) => !stillUsed.get(f)) };
  });
}
