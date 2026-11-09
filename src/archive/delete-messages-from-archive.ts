import type { DatabaseSync } from "node:sqlite";
import { removeOrphanMediaFiles } from "../media/remove-orphan-media-files.js";
import { deleteMessagesForGood } from "../storage/deleted-message-store.js";

/**
 * "Xóa khỏi kho" trên dashboard (một tin, cả album, hay nhiều tin chọn cùng lúc). Chỉ xóa trong KHO, không đụng Zalo:
 * người kia vẫn thấy tin, Zalo trên điện thoại / máy tính vẫn còn. Mã tin được ghi nhớ nên lấy bù / đồng bộ điện thoại /
 * phát lại nhật ký sau này không đưa tin vào lại; file media không tin nào khác dùng chung thì xóa luôn khỏi ổ để giải
 * phóng dung lượng thật (người dùng chốt 09/11/2026). Xóa rồi không khôi phục được.
 */
export const MAX_DELETE_PER_REQUEST = 500;

type Target = { id: number; msg_id: string; thread_id: string };

function targetsOf(db: DatabaseSync, ids: readonly number[]): Target[] {
  return db
    .prepare("SELECT id, msg_id, thread_id FROM messages WHERE id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify([...new Set(ids)])) as Target[];
}

/**
 * Cái sẽ mất nếu xóa các tin này: số tin có trong kho, số file + dung lượng file trên ổ sẽ bị xóa. File dùng chung với
 * tin KHÔNG nằm trong danh sách thì giữ, không tính.
 */
export function previewMessageDeletion(db: DatabaseSync, ids: readonly number[]): { messages: number; files: number; bytes: number } {
  const targets = targetsOf(db, ids);
  if (targets.length === 0) return { messages: 0, files: 0, bytes: 0 };
  const row = db
    .prepare(
      `WITH chosen AS (SELECT value AS msg_id FROM json_each(:msgIds)),
            own AS (SELECT local_path, MAX(size_bytes) AS size FROM attachments
                    WHERE local_path IS NOT NULL AND msg_id IN (SELECT msg_id FROM chosen) GROUP BY local_path)
       SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM own
       WHERE NOT EXISTS (SELECT 1 FROM attachments a WHERE a.local_path = own.local_path AND a.msg_id NOT IN (SELECT msg_id FROM chosen))`,
    )
    .get({ msgIds: JSON.stringify(targets.map((t) => t.msg_id)) }) as { files: number; bytes: number };
  return { messages: targets.length, files: Number(row.files), bytes: Number(row.bytes) };
}

/** Xóa hẳn các tin (theo số tin trong kho) + file không còn ai dùng. Số tin không có trong kho thì bỏ qua */
export function deleteMessagesFromArchive(
  db: DatabaseSync,
  mediaDir: string,
  ids: readonly number[],
  nowIso: string = new Date().toISOString(),
): { deleted: number; filesRemoved: number; bytes: number } {
  const { bytes } = previewMessageDeletion(db, ids);
  const byThread = new Map<string, string[]>();
  for (const t of targetsOf(db, ids)) byThread.set(t.thread_id, [...(byThread.get(t.thread_id) ?? []), t.msg_id]);
  let deleted = 0;
  const orphanFiles: string[] = [];
  for (const [threadId, msgIds] of byThread) {
    const r = deleteMessagesForGood(db, threadId, msgIds, nowIso);
    deleted += r.deleted;
    orphanFiles.push(...r.orphanFiles);
  }
  // Xóa file SAU khi DB đã xóa xong: hỏng giữa chừng thì chỉ sót file, không sót tin trỏ tới file đã mất
  const filesRemoved = orphanFiles.length > 0 ? removeOrphanMediaFiles(mediaDir, orphanFiles) : 0;
  return { deleted, filesRemoved, bytes };
}
