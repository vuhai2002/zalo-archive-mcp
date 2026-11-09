import type { MemberAvatar, ThreadKind } from "./dashboard-api-contract.js";

/**
 * Hợp đồng mục Quản lý dữ liệu (Cài đặt): tổng dung lượng kho, hội thoại theo dung lượng file, lưới file, xóa file giữ tin.
 *
 * GET  /api/storage?refresh=1                 -> StorageOverviewResponse (refresh: tính lại dung lượng ổ ở nền)
 * GET  /api/storage/threads?sort=&query=&limit=&offset=        -> StorageThreadsResponse
 * GET  /api/storage/files?thread=&tab=&big=1&sort=&limit=&offset= -> StorageFilesResponse
 * POST /api/storage/remove-preview  body StorageRemoveRequest   -> StorageRemovePreview
 * POST /api/storage/remove          body StorageRemoveRequest   -> StorageRemoveResult (xóa FILE, giữ tin)
 * POST /api/storage/backups/delete  body { names: string[] }    -> StorageOverviewResponse
 */
export type StorageOverviewResponse = {
  /** Thư mục kho của nick trên máy (vị trí lưu trữ) */
  location: string;
  /** Số đo trên ổ lần gần nhất (null = chưa từng đo); `computing` = đang đo lại ở nền */
  disk: {
    computedAt: string;
    drive: { totalBytes: number; freeBytes: number };
    mediaBytes: number;
    mediaFiles: number;
    databaseBytes: number;
    journalBytes: number;
    tempBytes: number;
    backups: Array<{ name: string; bytes: number; modifiedAt: string }>;
  } | null;
  computing: boolean;
  /** Theo kho ghi (nhanh, luôn có): file đã tải theo loại, file lớn hơn 5 MB + vài file lớn nhất để xem trước */
  byKind: Array<{ kind: StorageTab; files: number; bytes: number }>;
  bigFiles: { files: number; bytes: number; preview: StorageFile[] };
};

export type StorageTab = "all" | "photo" | "video" | "file" | "voice";

export type StorageThread = {
  threadId: string;
  threadType: ThreadKind;
  name: string | null;
  avatarUrl: string | null;
  memberAvatars: MemberAvatar[];
  memberCount: number | null;
  files: number;
  bytes: number;
  lastAt: string;
};
export type StorageThreadsResponse = { items: StorageThread[]; total: number };

export type StorageFile = {
  id: number;
  kind: "photo" | "gif" | "video" | "file" | "voice";
  fileName: string | null;
  sizeBytes: number;
  mime: string | null;
  url: string;
  sentAt: string;
  messageId: number;
  threadId: string;
  threadName: string | null;
  durationMs: number | null;
  /** Số tin khác dùng đúng file này: xóa ở đây thì ổ chưa trống ra cho tới khi xóa cả các tin kia */
  sharedWith: number;
};
export type StorageFilesResponse = { items: StorageFile[]; total: number; totalBytes: number };

export type StorageRemoveRequest = { attachmentIds?: number[]; threadIds?: string[] };
export type StorageRemovePreview = { files: number; bytes: number; shared: number };
export type StorageRemoveResult = { removed: number; filesDeleted: number; bytes: number };
