import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * Xóa hẳn tin khỏi kho + ghi nhớ mã tin (`deleted_messages`) để mọi đường đưa tin vào sau này (nghe trực tiếp, lấy bù,
 * đồng bộ điện thoại, phát lại nhật ký) không đưa tin đó vào lại. Hai nơi dùng:
 * - người dùng bấm Xóa khỏi kho trên dashboard (người dùng chốt 09/11/2026: xóa trong kho thì thôi, không đồng bộ lại);
 * - lệnh "xóa ở phía tôi" Zalo gửi về cho tin trong My Documents (người dùng chốt 03/11/2026).
 * Xóa trên Zalo ở mọi hội thoại khác thì kho vẫn giữ: không đi qua đây.
 */

/** Tin này đã bị xóa hẳn khỏi kho (không ghi lại) */
export function isDeletedMessage(db: DatabaseSync, msgId: string): boolean {
  return !!db.prepare("SELECT 1 FROM deleted_messages WHERE msg_id = ?").get(msgId);
}

/**
 * Xóa hẳn các tin của hội thoại `threadId` (cả đính kèm, cảm xúc, thu hồi, chỉ mục tìm kiếm) và ghi nhớ mã tin.
 * Chỉ đụng tin thuộc đúng hội thoại đó. Mốc tin cuối của hội thoại tính lại từ tin còn lại. Trả số tin đã xóa và file
 * media (đường dẫn trong thư mục media) không còn tin nào dùng - nơi gọi xóa file.
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
    // Xóa trúng tin mới nhất thì danh sách hội thoại phải theo tin còn lại (hết tin thì hội thoại rời danh sách)
    if (deleted > 0) {
      db.prepare("UPDATE threads SET last_message_at = (SELECT MAX(sent_at) FROM messages WHERE thread_id = ?) WHERE thread_id = ?").run(
        threadId,
        threadId,
      );
    }
    // File khử trùng theo nội dung: tin khác (hội thoại khác) có thể dùng chung file này
    const stillUsed = db.prepare("SELECT 1 FROM attachments WHERE local_path = ? LIMIT 1");
    return { deleted, orphanFiles: [...freed].filter((f) => !stillUsed.get(f)) };
  });
}
