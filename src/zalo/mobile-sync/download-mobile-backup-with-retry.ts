import { downloadBackupFile, DownloadAbortedError, type BackupDownloadOptions } from "./download-mobile-backup.js";
import type { SyncDbInfo, TSyncEventSyncMsgInfo } from "./mobile-sync-types.js";

/**
 * Tải bản sao lưu điện thoại, hỏng thì thử lại như Zalo PC (26.10.20, bước `download_backup`: `maxRetry: 2`,
 * `autoRetry: 5e3`). Điện thoại báo xong (`syncmsg_info`) mà máy chủ có lúc chưa phục vụ được file ngay: lần đồng
 * bộ toàn bộ lịch sử có lần nhận HTTP 404 đúng giây nhận link, kho bỏ cuộc luôn. Hủy giữa chừng hay đầy đĩa thì
 * không thử lại (Zalo PC cũng vậy).
 */
export const BACKUP_DOWNLOAD_RETRIES = 2;
export const BACKUP_DOWNLOAD_RETRY_DELAY_MS = 5_000;

export type BackupRetryDeps = {
  download?: (opts: BackupDownloadOptions) => Promise<{ bytes: number }>;
  sleep?: (ms: number) => Promise<void>;
  /** Báo trước mỗi lần thử lại (lần thứ `retry` trên `of`), kèm lỗi vừa gặp */
  onRetry?: (retry: number, of: number, err: Error) => void;
};

const canRetry = (err: unknown) => !(err instanceof DownloadAbortedError) && !String((err as { code?: unknown })?.code ?? "").includes("ENOSPC");

export async function downloadBackupWithRetry(opts: BackupDownloadOptions, deps: BackupRetryDeps = {}): Promise<{ bytes: number }> {
  const download = deps.download ?? downloadBackupFile;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await download(opts);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!canRetry(error) || opts.shouldAbort?.()) throw error;
      if (attempt >= BACKUP_DOWNLOAD_RETRIES) {
        throw new Error(`${error.message} - đã thử ${attempt + 1} lần, bấm đồng bộ lại sau ít phút`);
      }
      deps.onRetry?.(attempt + 1, BACKUP_DOWNLOAD_RETRIES, error);
      await sleep(BACKUP_DOWNLOAD_RETRY_DELAY_MS);
      if (opts.shouldAbort?.()) throw new DownloadAbortedError();
    }
  }
}

/** Thông tin điện thoại gửi kèm link (cỡ file, số tin...) để ghi log - không có link đầy đủ, không có khóa */
export function describeBackupInfo(info: TSyncEventSyncMsgInfo, dbInfo: SyncDbInfo): Record<string, unknown> {
  let host: string | null = null;
  try {
    host = new URL(String(info.url || "")).host;
  } catch {
    /* link hỏng: để null */
  }
  return {
    host,
    fileSize: info.file_size ?? null,
    isFullTransfer: info.is_full_transfer ?? null,
    fromSeqId: info.from_seq_id ?? null,
    triggerReason: info.trigger_reason ?? null,
    deviceType: info.device_type ?? null,
    clientVersion: info.client_version ?? null,
    dbFormat: dbInfo.db_format ?? null,
    backupDb: dbInfo.backup_db ?? null,
    originDb: dbInfo.origin_db ?? null,
  };
}
