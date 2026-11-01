import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { ZaloPcImportProgress, ZaloPcMediaImportStatus } from "../dashboard/dashboard-api-contract.js";
import { importMediaFromZaloPc } from "../media/import-media-from-zalo-pc.js";
import { getMeta } from "../storage/thread-directory-store.js";

/**
 * Lượt lấy lại media từ Zalo PC của MỘT nick, chạy nền theo nút bấm trên dashboard (mỗi lúc một lượt).
 * Không cần phiên Zalo: chỉ đọc thư mục Zalo PC đã tải về máy rồi chép sang kho.
 */
export type ZaloPcImportStatus = ZaloPcMediaImportStatus;

export class ZaloPcMediaImportJob {
  private running = false;
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private progress: ZaloPcImportProgress | null = null;
  private error: string | null = null;

  constructor(
    private readonly d: {
      db: DatabaseSync;
      mediaDir: string;
      /** Thư mục ZaloDownloads của nick theo mã nick (null khi không xác định được) */
      downloadsDirFor: (uid: string) => string | null;
      log: Logger;
    },
  ) {}

  private selfUid(): string | null {
    return getMeta(this.d.db, "self_uid");
  }

  private downloadsDir(): string | null {
    const uid = this.selfUid();
    return uid ? this.d.downloadsDirFor(uid) : null;
  }

  status(): ZaloPcImportStatus {
    const dir = this.downloadsDir();
    return {
      downloadsDir: dir,
      available: !!dir && fs.existsSync(dir),
      running: this.running,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      progress: this.progress,
      error: this.error,
    };
  }

  /** Bắt đầu một lượt (không chờ xong). Lỗi khi đang chạy hoặc không thấy thư mục Zalo PC. */
  start(): { ok: true } | { ok: false; error: string } {
    if (this.running) return { ok: false, error: "Đang lấy rồi - chờ lượt này xong" };
    const uid = this.selfUid();
    const dir = this.downloadsDir();
    if (!uid || !dir) return { ok: false, error: "Chưa biết mã nick (đăng nhập Zalo một lần) hoặc máy này không có Zalo PC" };
    if (!fs.existsSync(dir)) return { ok: false, error: "Không thấy thư mục tải về của Zalo PC cho nick này trên máy" };
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.error = null;
    this.progress = null;
    void importMediaFromZaloPc({
      db: this.d.db,
      mediaDir: this.d.mediaDir,
      downloadsDir: dir,
      selfUid: uid,
      log: this.d.log,
      onProgress: (p) => (this.progress = p),
    })
      .then((p) => this.d.log.info({ ...p }, "Đã lấy lại media từ Zalo PC"))
      .catch((err) => {
        this.error = err instanceof Error ? err.message : String(err);
        this.d.log.error({ err }, "Lấy media từ Zalo PC hỏng");
      })
      .finally(() => {
        this.running = false;
        this.finishedAt = new Date().toISOString();
      });
    return { ok: true };
  }
}
