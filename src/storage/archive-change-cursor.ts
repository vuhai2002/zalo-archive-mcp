import type { DatabaseSync } from "node:sqlite";

/**
 * Mốc "đã báo tới đâu" để dashboard tự cập nhật (SSE): tin mới (`messages.id`), cảm xúc và thu hồi
 * mới (rowid của bảng), file vừa tải xong (`attachments.fetched_at`). Mỗi lần dò chỉ vài truy vấn
 * theo khóa / chỉ mục, nên dò mỗi giây vẫn nhẹ. Bắt được mọi nguồn ghi: nghe trực tiếp, lấy bù,
 * đồng bộ điện thoại, vòng tải media.
 */
export type ChangeCursor = { messageId: number; reactionRowid: number; recallRowid: number; fetchedAt: string };

const num = (db: DatabaseSync, sql: string) => Number((db.prepare(sql).get() as { v: number | null }).v ?? 0);

export function currentChangeCursor(db: DatabaseSync): ChangeCursor {
  return {
    messageId: num(db, "SELECT MAX(id) AS v FROM messages"),
    reactionRowid: num(db, "SELECT MAX(rowid) AS v FROM message_reaction_taps"),
    recallRowid: num(db, "SELECT MAX(rowid) AS v FROM message_recalls"),
    fetchedAt: String((db.prepare("SELECT MAX(fetched_at) AS v FROM attachments").get() as { v: string | null }).v ?? ""),
  };
}

/** Các hội thoại đã đổi kể từ `since`, kèm mốc mới để lần sau dò tiếp */
export function collectArchiveChanges(db: DatabaseSync, since: ChangeCursor): { threadIds: string[]; cursor: ChangeCursor } {
  const cursor = currentChangeCursor(db);
  const ids = new Set<string>();
  const add = (sql: string, arg: number | string) => {
    for (const r of db.prepare(sql).all(arg) as Array<{ thread_id: string }>) ids.add(r.thread_id);
  };
  if (cursor.messageId > since.messageId) add("SELECT DISTINCT thread_id FROM messages WHERE id > ?", since.messageId);
  if (cursor.reactionRowid > since.reactionRowid) add("SELECT DISTINCT thread_id FROM message_reaction_taps WHERE rowid > ?", since.reactionRowid);
  if (cursor.recallRowid > since.recallRowid) add("SELECT DISTINCT thread_id FROM message_recalls WHERE rowid > ?", since.recallRowid);
  if (cursor.fetchedAt > since.fetchedAt) {
    add(
      `SELECT DISTINCT m.thread_id FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
       WHERE a.fetched_at > ?`,
      since.fetchedAt,
    );
  }
  return { threadIds: [...ids], cursor };
}
