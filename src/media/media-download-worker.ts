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
import { downloadToTempFile, type DownloadOutcome } from "./download-to-file.js";
import type { MediaLinkRenewer } from "./media-link-renewer.js";
import { chooseExtension, mediaRelativePath } from "./media-file-naming.js";
import { placeDownloadedFile, saveJxlPhotoAsPng, type SavedMedia } from "./save-jxl-photo-as-png.js";
import { convertJxlToPng, looksLikeJxl, zaloJxlVariantUrl } from "./zalo-jxl-photo.js";

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
  /** Đổi ảnh JXL sang PNG; test thay bằng bản giả để khỏi nạp WASM */
  convertJxl?: (bytes: Uint8Array) => Uint8Array;
  /** Xin Zalo cấp lại link khi link hết hạn; không có thì link hết hạn là hỏng hẳn */
  renewer?: MediaLinkRenewer;
};

const IDLE_MS = 10_000;
const RETRY_BASE_MS = 60_000;

/**
 * Tải ngay mọi file đính kèm mới, TỪNG file một (lịch sự với CDN, không dồn
 * băng thông). URL Zalo có thể hết hạn nên tải sớm là việc chính; tuổi thọ
 * thật chưa đo - đo trên nick phụ rồi chỉnh MEDIA_MAX_ATTEMPTS và nhịp thử lại.
 *
 * Link hết hạn (tin cũ từ điện thoại, lấy bù, file hỏng lâu) thì xin Zalo cấp lại
 * link mới như Zalo Web, mỗi file một lần, theo lượt đã giãn nhịp (`renewer`).
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

  private fetchToTemp(url: string): Promise<DownloadOutcome> {
    return downloadToTempFile({
      url,
      tempDir: path.join(this.o.mediaDir, ".tmp"),
      maxBytes: this.o.maxBytes,
      allowedHostSuffixes: this.o.allowedHostSuffixes,
      timeoutMs: this.o.downloadTimeoutMs,
      fetchImpl: this.o.fetchImpl,
    });
  }

  private async download(item: PendingAttachment, now: Date): Promise<number> {
    if (item.needsRenew && this.o.renewer) {
      const renewed = await this.o.renewer.renew(item, now);
      if (renewed.kind === "wait") return 0;
      if (renewed.kind === "failed") return 1_000;
      item = { ...item, remoteUrl: renewed.url, renewedAt: now.toISOString() };
    }

    let result = await this.fetchToTemp(item.remoteUrl);
    let jxlError: string | null = null;
    // Bản JPG trên CDN ảnh Zalo hỏng (Zalo giữ gốc ở JXL, khâu đổi ra JPG lỗi): thử bản JXL gốc
    const jxlUrl = !result.ok && result.status === "failed" && item.kind === "photo" ? zaloJxlVariantUrl(item.remoteUrl) : null;
    if (jxlUrl) {
      const viaJxl = await this.fetchToTemp(jxlUrl);
      if (viaJxl.ok) {
        result = viaJxl;
        this.o.log.info({ id: item.id }, "Bản JPG hỏng, đã tải bản JXL gốc của ảnh");
      } else {
        jxlError = viaJxl.error;
      }
    }

    if (!result.ok) {
      // Ghi kèm "JXL" khi đã thử: lần khởi động sau không xếp lại ảnh này lần nữa
      let error = jxlError ? `${result.error} (bản JXL: ${jxlError})` : result.error;
      if (result.expired && this.o.renewer?.scheduleAfterExpiry(item, error, now)) return 1_000;
      if (result.expired && item.renewedAt) error = `Link đã xin lại vẫn hỏng: ${error}`;
      this.retryOrFail(item, now, { ...result, error });
      this.o.log.warn({ id: item.id, kind: item.kind, error, attempts: item.attempts }, "Tải media hỏng");
      return 1_000;
    }

    const saved = this.save(item, result);
    markAttachmentDone(this.o.db, item.id, {
      localPath: saved.rel,
      sha256: saved.sha256,
      sizeBytes: saved.sizeBytes,
      mime: saved.mime,
    });
    this.o.log.debug({ id: item.id, bytes: saved.sizeBytes, rel: saved.rel }, "Đã tải media");
    return 0;
  }

  /** Cất file vừa tải. Ảnh JXL (trình duyệt không hiện được) thì đổi sang PNG, giữ bản gốc bên cạnh. */
  private save(item: PendingAttachment, r: Extract<DownloadOutcome, { ok: true }>): SavedMedia {
    if (item.kind === "photo" || item.kind === "gif") {
      const head = new Uint8Array(16);
      const fd = fs.openSync(r.tempFile, "r");
      try {
        fs.readSync(fd, head, 0, head.length, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (looksLikeJxl(r.mime, head)) {
        try {
          return saveJxlPhotoAsPng({ tempFile: r.tempFile, mediaDir: this.o.mediaDir, convert: this.o.convertJxl ?? convertJxlToPng });
        } catch (err) {
          // Không đổi được thì vẫn giữ file JXL gốc: kho không mất ảnh, chỉ dashboard không hiện
          this.o.log.warn({ id: item.id, err }, "Không đổi được ảnh JXL sang PNG - giữ nguyên file JXL");
        }
      }
    }
    const rel = mediaRelativePath(r.sha256, chooseExtension({ kind: item.kind, fileName: item.fileName, mime: r.mime, url: item.remoteUrl }));
    placeDownloadedFile(r.tempFile, path.join(this.o.mediaDir, rel));
    return { rel, sha256: r.sha256, sizeBytes: r.sizeBytes, mime: r.mime };
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
