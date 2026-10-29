import type { DatabaseSync } from "node:sqlite";
import { collectArchiveChanges, currentChangeCursor, type ChangeCursor } from "../storage/archive-change-cursor.js";

export type ChangeListener = (threadIds: string[]) => void;

/**
 * Một bộ phát thay đổi cho mỗi nick, dùng chung cho mọi tab dashboard đang mở: chỉ dò kho khi có
 * ít nhất một tab nghe (không ai mở dashboard thì không tốn gì), mỗi `intervalMs` một lần; nhiều tin
 * tới trong một nhịp gộp thành một lần báo.
 */
export function createArchiveChangeFeed(db: DatabaseSync, intervalMs: number): { subscribe: (l: ChangeListener) => () => void } {
  const listeners = new Set<ChangeListener>();
  let cursor: ChangeCursor | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    if (!cursor) return;
    try {
      const r = collectArchiveChanges(db, cursor);
      cursor = r.cursor;
      if (r.threadIds.length === 0) return;
      for (const l of listeners) l(r.threadIds);
    } catch {
      // DB đang bận (khóa ghi) thì nhịp sau dò lại - mốc chưa đổi nên không mất thay đổi nào
    }
  };

  return {
    subscribe: (l) => {
      listeners.add(l);
      if (!timer) {
        cursor = currentChangeCursor(db);
        timer = setInterval(tick, intervalMs);
        timer.unref?.();
      }
      return () => {
        listeners.delete(l);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
          cursor = null;
        }
      };
    },
  };
}
