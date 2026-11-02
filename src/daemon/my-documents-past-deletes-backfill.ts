import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { listJournalFiles, readJournalFile } from "../archive/raw-event-journal.js";
import { removeOrphanMediaFiles } from "../media/remove-orphan-media-files.js";
import { deleteMessagesForGood, myDocumentsThreadId } from "../storage/my-documents-deletion-store.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";
import { isLocalDeletePayload, localDeleteTargets, type RawListenerMessage } from "../zalo/normalize-zalo-event.js";

const DONE_KEY = "my_documents_past_deletes_applied_at";

/**
 * Một lần: áp dụng các lệnh xóa trong My Documents đã nằm trong nhật ký thô từ TRƯỚC khi kho biết xóa hẳn
 * (trước đó kho bỏ qua lệnh xóa). Lệnh xóa mới từ đây đi qua listener. Chưa biết mã My Documents thì để lần
 * khởi động sau. Trả số tin đã xóa.
 */
export async function applyPastMyDocumentsDeletes(o: {
  db: DatabaseSync;
  journalDir: string;
  mediaDir: string;
  log: Logger;
}): Promise<number> {
  if (getMeta(o.db, DONE_KEY)) return 0;
  const threadId = myDocumentsThreadId(o.db);
  if (!threadId) return 0;
  const ids = new Set<string>();
  for (const file of listJournalFiles(o.journalDir)) {
    for await (const record of readJournalFile(file, () => {})) {
      if (record.event !== "message" && record.event !== "old_messages") continue;
      const p = record.payload as { message?: RawListenerMessage; messages?: RawListenerMessage[] } | null;
      for (const m of p?.message ? [p.message] : (p?.messages ?? [])) {
        if (m?.isSelf && m.threadId === threadId && m.data && isLocalDeletePayload(m.data)) {
          for (const id of localDeleteTargets(m.data)) ids.add(id);
        }
      }
    }
  }
  const nowIso = new Date().toISOString();
  const r = deleteMessagesForGood(o.db, threadId, [...ids], nowIso);
  removeOrphanMediaFiles(o.mediaDir, r.orphanFiles);
  setMeta(o.db, DONE_KEY, nowIso);
  o.log.info({ commands: ids.size, deleted: r.deleted, files: r.orphanFiles.length }, "Đã áp dụng lệnh xóa cũ trong My Documents");
  return r.deleted;
}
