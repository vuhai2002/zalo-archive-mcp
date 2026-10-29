import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { AppEnv } from "../config/env-schema.js";
import { isAllowedMediaHost } from "../media/media-file-naming.js";
import { requeueJxlRecoverablePhotos, requeueNowAllowedAttachments, resetStuckDownloads } from "../storage/attachment-queue-store.js";
import { closeDanglingConnection } from "../storage/connection-event-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { failStuckSending } from "../storage/outbox-store.js";
import { getMeta } from "../storage/thread-directory-store.js";

/**
 * Mở DB của một nick cho daemon và dọn dấu vết lần chạy trước bị chết ngang:
 * khoảng thủng listener, file tải dở, tin đang gửi dở (đánh failed, KHÔNG gửi lại).
 * Gọi MỘT lần cho mỗi nick, lúc daemon cần tới nick đó lần đầu.
 */
export function openAccountDatabaseForDaemon(databaseFile: string, env: AppEnv, log: Logger): DatabaseSync {
  const db = openArchiveDatabase(databaseFile);
  if (closeDanglingConnection(db, getMeta(db, "listener_heartbeat_at"))) log.warn("Lần chạy trước dừng đột ngột - đã ghi bù khoảng thủng");
  const resetMedia = resetStuckDownloads(db, env.MEDIA_MAX_ATTEMPTS);
  if (resetMedia > 0) log.info({ resetMedia }, "Đưa media tải dở về hàng đợi");
  const requeued = requeueNowAllowedAttachments(db, (url) => isAllowedMediaHost(url, env.MEDIA_ALLOWED_HOST_SUFFIXES));
  if (requeued > 0) log.info({ requeued }, "Tải lại file từng bị chặn vì host (nay đã được phép)");
  const jxlRetry = requeueJxlRecoverablePhotos(db);
  if (jxlRetry > 0) log.info({ jxlRetry }, "Tải lại ảnh hỏng, lần này thử cả bản JXL gốc");
  const failedSends = failStuckSending(db);
  if (failedSends > 0) log.warn({ failedSends }, "Có tin đang gửi dở từ lần trước - đánh failed, KHÔNG tự gửi lại");
  return db;
}
