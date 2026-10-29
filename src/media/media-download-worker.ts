import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import {
  claimNextAttachment,
  markAttachmentDone,
  markAttachmentFailed,
  type PendingAttachment,
} from "../storage/attachment-queue-store.js";
import { downloadToTempFile } from "./download-to-file.js";
import { chooseExtension, mediaRelativePath } from "./media-file-naming.js";

export type MediaWorkerOptions = {
  db: DatabaseSync;
  mediaDir: string;
  log: Logger;
  allowedHostSuffixes: readonly string[];
  maxBytes: number;
  maxAttempts: number;
  downloadTimeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const IDLE_MS = 10_000;
const RETRY_BASE_MS = 60_000;

/**
 * Tải ngay mọi file đính kèm mới, TỪNG file một (lịch sự với CDN, không dồn
 * băng thông). URL Zalo có thể hết hạn nên tải sớm là việc chính; tuổi thọ
 * thật chưa đo - đo trên nick phụ rồi chỉnh MEDIA_MAX_ATTEMPTS và nhịp thử lại.
 *
 * Còn thiếu (chờ số đo): làm mới URL hết hạn qua renewlink như Zalo Web.
 */
export class MediaDownloadWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly o: MediaWorkerOptions) {}

  /** Tải một file. Trả số ms nên chờ trước lượt sau. */
  async tick(): Promise<number> {
    const now = (this.o.now ?? (() => new Date()))();
    const item = claimNextAttachment(this.o.db, now.toISOString());
    if (!item) return IDLE_MS;
    try {
      return await this.download(item, now);
    } catch (err) {
      // Lỗi bất ngờ (vd đổi tên file bị khóa) không được để dòng kẹt ở downloading
      const message = err instanceof Error ? err.message : String(err);
      this.retryOrFail(item, now, { error: `Lỗi nội bộ: ${message}`, permanent: false, status: "failed" });
      this.o.log.error({ id: item.id, err }, "Lỗi khi lưu media");
      return 1_000;
    }
  }

  private retryOrFail(
    item: PendingAttachment,
    now: Date,
    r: { error: string; permanent: boolean; status: "failed" | "too_large" | "blocked_host" },
  ): void {
    if (r.permanent || item.attempts >= this.o.maxAttempts) {
      markAttachmentFailed(this.o.db, item.id, { error: r.error, finalStatus: r.status });
    } else {
      const retryAt = new Date(now.getTime() + RETRY_BASE_MS * 2 ** (item.attempts - 1)).toISOString();
      markAttachmentFailed(this.o.db, item.id, { error: r.error, retryAt });
    }
  }

  private async download(item: PendingAttachment, now: Date): Promise<number> {
    const result = await downloadToTempFile({
      url: item.remoteUrl,
      tempDir: path.join(this.o.mediaDir, ".tmp"),
      maxBytes: this.o.maxBytes,
      allowedHostSuffixes: this.o.allowedHostSuffixes,
      timeoutMs: this.o.downloadTimeoutMs,
      fetchImpl: this.o.fetchImpl,
    });

    if (!result.ok) {
      this.retryOrFail(item, now, result);
      this.o.log.warn({ id: item.id, kind: item.kind, error: result.error, attempts: item.attempts }, "Tải media hỏng");
      return 1_000;
    }

    const rel = mediaRelativePath(
      result.sha256,
      chooseExtension({ kind: item.kind, fileName: item.fileName, mime: result.mime, url: item.remoteUrl }),
    );
    const finalPath = path.join(this.o.mediaDir, rel);
    try {
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      if (fs.existsSync(finalPath)) fs.rmSync(result.tempFile, { force: true });
      else fs.renameSync(result.tempFile, finalPath);
    } catch (err) {
      fs.rmSync(result.tempFile, { force: true });
      throw err;
    }

    markAttachmentDone(this.o.db, item.id, {
      localPath: rel,
      sha256: result.sha256,
      sizeBytes: result.sizeBytes,
      mime: result.mime,
    });
    this.o.log.debug({ id: item.id, bytes: result.sizeBytes, rel }, "Đã tải media");
    return 0;
  }

  /** Xóa file tạm còn sót từ lần chạy trước (tiến trình chết giữa lúc tải) */
  sweepTempFiles(): number {
    const dir = path.join(this.o.mediaDir, ".tmp");
    if (!fs.existsSync(dir)) return 0;
    const parts = fs.readdirSync(dir).filter((f) => f.endsWith(".part"));
    for (const f of parts) fs.rmSync(path.join(dir, f), { force: true });
    return parts.length;
  }

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      let delay = IDLE_MS;
      try {
        delay = await this.tick();
      } catch (err) {
        this.o.log.error({ err }, "Vòng tải media gặp lỗi");
      }
      if (!this.stopped) this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, 2_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
