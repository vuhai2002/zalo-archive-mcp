import type { DatabaseSync } from "node:sqlite";

/**
 * Ghim hội thoại lên đầu danh sách trên dashboard (như Zalo). Ghim chỉ lưu trong kho, không gọi
 * Zalo - nick Chỉ đọc vẫn ghim được. `pinned_at` = lúc ghim: ghim sau đứng trước.
 * Trả false nếu kho chưa có hội thoại này.
 */
export function setThreadPinned(db: DatabaseSync, threadId: string, pinned: boolean, nowIso: string): boolean {
  const r = db.prepare("UPDATE threads SET pinned_at = ? WHERE thread_id = ?").run(pinned ? nowIso : null, threadId);
  return Number(r.changes) > 0;
}
