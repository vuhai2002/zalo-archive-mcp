import type { DatabaseSync } from "node:sqlite";
import { mediaFamilyRange } from "../media/remove-orphan-media-files.js";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * "Xóa file, giữ tin" (dọn dữ liệu kiểu Zalo, người dùng chốt 2026-11-09): đính kèm đã tải chuyển sang trạng thái `removed` -
 * tin vẫn còn (chữ, chú thích, cảm xúc), chỗ file hiện "đã xóa file khỏi kho". Mọi luồng tải / xin link / lấy từ Zalo PC /
 * đồng bộ đều chọn theo trạng thái cụ thể nên không đụng tới `removed`: file không quay lại.
 *
 * File trên ổ khử trùng theo nội dung (một file cho nhiều tin giống hệt): chỉ xóa khỏi ổ khi KHÔNG còn đính kèm nào khác dùng.
 */

/** Loại đính kèm có trong mục dọn dữ liệu: sticker rất nhỏ và là của Zalo, không liệt kê (Zalo cũng vậy) */
export const CLEANABLE_KINDS = ["photo", "gif", "video", "file", "voice"] as const;
const KIND_LIST = CLEANABLE_KINDS.map((k) => `'${k}'`).join(", ");

type Picked = { id: number; local_path: string; size_bytes: number | null };

function pick(db: DatabaseSync, ids: readonly number[]): Picked[] {
  return db
    .prepare(
      `SELECT id, local_path, size_bytes FROM attachments
       WHERE id IN (SELECT value FROM json_each(?)) AND status = 'done' AND local_path IS NOT NULL AND kind IN (${KIND_LIST})`,
    )
    .all(JSON.stringify([...new Set(ids)])) as Picked[];
}

/** Đính kèm đang dùng họ file này (file chính + bản đi kèm cùng tên sha - xóa là xóa cả họ) */
function familyUsers(db: DatabaseSync, localPath: string): number[] {
  const r = mediaFamilyRange(localPath);
  const rows = db
    .prepare("SELECT id FROM attachments WHERE local_path = ? OR (local_path >= ? AND local_path < ?)")
    .all(r.exact, r.from, r.to) as Array<{ id: number }>;
  return rows.map((x) => x.id);
}

/** Số đính kèm khác (ngoài danh sách) còn dùng file này */
const otherUsers = (db: DatabaseSync, localPath: string, chosen: ReadonlySet<number>) =>
  familyUsers(db, localPath).filter((id) => !chosen.has(id)).length;

/**
 * Cái sẽ mất nếu xóa file của các đính kèm này: số file xóa được, dung lượng (theo kho ghi), số đính kèm mà file vẫn phải giữ
 * trên ổ vì tin khác (ngoài danh sách) dùng chung.
 */
export function previewFileRemoval(db: DatabaseSync, ids: readonly number[]): { files: number; bytes: number; shared: number } {
  const picked = pick(db, ids);
  const chosen = new Set(picked.map((p) => p.id));
  const byPath = new Map<string, number>();
  for (const p of picked) byPath.set(p.local_path, Math.max(byPath.get(p.local_path) ?? 0, p.size_bytes ?? 0));
  let bytes = 0;
  let shared = 0;
  for (const [localPath, size] of byPath) {
    if (otherUsers(db, localPath, chosen) > 0) shared += picked.filter((p) => p.local_path === localPath).length;
    else bytes += size;
  }
  return { files: picked.length, bytes, shared };
}

/**
 * Đánh dấu đã xóa file (giữ tin) và trả đường dẫn file không còn ai dùng - nơi gọi xóa khỏi ổ SAU khi DB đã ghi xong.
 * Chỉ đụng đính kèm đã tải; số không hợp lệ / đã xóa thì bỏ qua.
 */
export function markFilesRemoved(db: DatabaseSync, ids: readonly number[], nowIso: string): { removed: number; orphanPaths: string[] } {
  return inTransaction(db, () => {
    const picked = pick(db, ids);
    const mark = db.prepare("UPDATE attachments SET status = 'removed', removed_at = ?, local_path = NULL WHERE id = ? AND status = 'done'");
    for (const p of picked) mark.run(nowIso, p.id);
    const orphanPaths = [...new Set(picked.map((p) => p.local_path))].filter((lp) => familyUsers(db, lp).length === 0);
    return { removed: picked.length, orphanPaths };
  });
}

/** Mọi đính kèm đã tải (dọn được) của các hội thoại - "Xóa dữ liệu" cả hội thoại như Zalo PC */
export function cleanableAttachmentIdsOfThreads(db: DatabaseSync, threadIds: readonly string[]): number[] {
  const rows = db
    .prepare(
      `SELECT a.id FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
       WHERE m.thread_id IN (SELECT value FROM json_each(?)) AND a.status = 'done' AND a.local_path IS NOT NULL AND a.kind IN (${KIND_LIST})`,
    )
    .all(JSON.stringify([...new Set(threadIds)])) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}
