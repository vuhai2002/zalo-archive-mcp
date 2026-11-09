import type { DatabaseSync } from "node:sqlite";
import { removeOrphanMediaFilesMeasured } from "../media/remove-orphan-media-files.js";
import { cleanableAttachmentIdsOfThreads, markFilesRemoved, previewFileRemoval } from "../storage/attachment-file-removal-store.js";

/**
 * "Xóa dữ liệu" của mục Quản lý dữ liệu: xóa FILE, GIỮ TIN (người dùng chốt 2026-11-09). Nhận số đính kèm (chọn trong lưới) hoặc
 * cả hội thoại (chọn trong danh sách). Chỉ xóa trong kho, không đụng Zalo. Xóa rồi không khôi phục được và không tải lại.
 */
export const MAX_REMOVE_ATTACHMENTS = 5_000;
export const MAX_REMOVE_THREADS = 200;

export type RemovalTarget = { attachmentIds?: number[]; threadIds?: string[] };

function idsOf(db: DatabaseSync, t: RemovalTarget): number[] {
  return [...new Set([...(t.attachmentIds ?? []), ...(t.threadIds?.length ? cleanableAttachmentIdsOfThreads(db, t.threadIds) : [])])];
}

export function previewRemoval(db: DatabaseSync, t: RemovalTarget): { files: number; bytes: number; shared: number } {
  return previewFileRemoval(db, idsOf(db, t));
}

/** Xóa: ghi DB trước (đính kèm thành "đã xóa file"), rồi mới xóa file trên ổ - hỏng giữa chừng thì chỉ sót file, không sót tin trỏ tới file đã mất */
export function removeAttachmentFiles(
  db: DatabaseSync,
  mediaDir: string,
  t: RemovalTarget,
  nowIso: string = new Date().toISOString(),
): { removed: number; filesDeleted: number; bytes: number } {
  const { removed, orphanPaths } = markFilesRemoved(db, idsOf(db, t), nowIso);
  const freed = orphanPaths.length > 0 ? removeOrphanMediaFilesMeasured(mediaDir, orphanPaths) : { files: 0, bytes: 0 };
  return { removed, filesDeleted: freed.files, bytes: freed.bytes };
}
