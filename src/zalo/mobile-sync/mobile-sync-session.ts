import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { decryptBackupKey, extractZdbBackup, generateSyncKeyPair, verifyChecksum } from "./decrypt-zdb-backup.js";
import { describeUnimportedBackupFiles } from "./describe-unimported-backup-files.js";
import { describeBackupInfo, downloadBackupWithRetry } from "./download-mobile-backup-with-retry.js";
import { importMobileBackupFiles, MobileSyncCancelled } from "./import-mobile-backup-files.js";
import {
  SyncEventType,
  type MobileSyncStage,
  type MobileSyncStats,
  type MobileSyncStatus,
  type SyncDbInfo,
  type SyncEvent,
  type TSyncEventSyncMsgInfo,
} from "./mobile-sync-types.js";
import { attachSyncEventListener, DEFAULT_SYNC_PC_NAME, installMobileSyncApis, setMobileSyncWarnLogger, type MobileSyncApi } from "./zca-mobile-sync-apis.js";

/**
 * Một lượt "Đồng bộ tin nhắn từ điện thoại" cho nick đang chạy (luồng như Zalo Web / deplao):
 * gửi `pull_mobile_msg` kèm khóa RSA -> điện thoại hỏi xác nhận -> điện thoại tạo bản sao lưu và
 * báo `syncmsg_info` (link + khóa đã mã hóa) -> tải, giải mã, nhập vào kho -> xóa file tạm.
 * Mỗi lúc một lượt; chỉ chạy khi người dùng bấm, không bao giờ tự chạy.
 */
const CONFIRM_TIMEOUT_MS = 3 * 60_000;
const BACKUP_TIMEOUT_MS = 30 * 60_000;
const TERMINAL: MobileSyncStage[] = ["completed", "failed", "cancelled"];
const WAITING: MobileSyncStage[] = ["requesting", "waiting_confirm", "waiting_backup", "mobile_idle"];

const emptyStats = (): MobileSyncStats => ({
  conversations: 0,
  conversationsResolved: 0,
  conversationsUnresolved: 0,
  messagesRead: 0,
  messagesImported: 0,
  messagesSkipped: 0,
  messagesOutOfRange: 0,
  durationMs: 0,
});

export type MobileSyncDeps = { api: API; db: DatabaseSync; accountId: string; workDir: string; log: Logger };

export class MobileSyncSession {
  private status_: MobileSyncStatus | null = null;
  private keys: { publicKey: string; privateKey: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private importing = false;
  private readonly api: MobileSyncApi & API;
  private readonly detach: () => void;

  constructor(private readonly d: MobileSyncDeps) {
    setMobileSyncWarnLogger((m) => d.log.warn(m));
    this.api = installMobileSyncApis(d.api) as MobileSyncApi & API;
    this.detach = attachSyncEventListener(d.api, (e) => this.onSyncEvent(e));
  }

  status(): MobileSyncStatus | null {
    return this.status_;
  }

  /** Bắt đầu một lượt; `fromTs`/`toTs` (ms) giới hạn khoảng thời gian, 0 = không giới hạn */
  async start(range: { fromTs: number; toTs: number }): Promise<{ ok: boolean; error?: string }> {
    if (this.status_ && !TERMINAL.includes(this.status_.stage)) return { ok: false, error: "Đang có một lượt đồng bộ chạy" };
    this.keys = generateSyncKeyPair();
    this.cancelled = false;
    this.status_ = {
      zaloId: this.d.accountId,
      stage: "requesting",
      progress: 0,
      message: "Đang gửi yêu cầu tới điện thoại...",
      pcName: DEFAULT_SYNC_PC_NAME,
      range: { fromTs: range.fromTs || null, toTs: range.toTs || null },
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await this.api.pullMobile({ public_key: this.keys.publicKey, pc_name: DEFAULT_SYNC_PC_NAME, from_seq_id: range.fromTs || 0, min_seq_id: 0 });
    } catch (err) {
      this.finish("failed", `Không gửi được yêu cầu đồng bộ: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, error: this.status_.message };
    }
    this.d.log.info({ fromTs: range.fromTs, toTs: range.toTs }, "Đã gửi yêu cầu đồng bộ từ điện thoại, chờ xác nhận");
    this.setStage("waiting_confirm", 'Mở Zalo trên điện thoại và bấm "Đồng ý" để đồng bộ tin nhắn sang máy tính');
    this.arm(CONFIRM_TIMEOUT_MS, "Hết thời gian chờ xác nhận trên điện thoại");
    return { ok: true };
  }

  async cancel(): Promise<void> {
    if (!this.status_ || TERMINAL.includes(this.status_.stage)) return;
    this.cancelled = true;
    this.clearTimer();
    if (!this.importing) {
      await this.cancelOnServer();
      this.finish("cancelled", "Đã hủy đồng bộ");
    }
  }

  /** Dừng hẳn (nick dừng / đổi nick): hủy lượt đang chạy, gỡ listener */
  dispose(): void {
    this.cancelled = true;
    this.clearTimer();
    this.detach();
  }

  onSyncEvent(e: SyncEvent): void {
    const s = this.status_;
    if (!s || !this.keys || this.importing || TERMINAL.includes(s.stage)) return;
    const data = (e.data ?? {}) as Record<string, unknown>;
    if (data.public_key !== this.keys.publicKey) return;
    if (e.type === SyncEventType.USER_CONFIRM) {
      const action = Number(data.user_action);
      if (action === 1 || action === 3) this.waitBackup();
      else if (action === 0) this.finish("cancelled", "Bạn đã từ chối đồng bộ trên điện thoại");
      else if (action === 2) this.finish("failed", "Điện thoại đang khôi phục dữ liệu, thử lại sau");
    } else if (e.type === SyncEventType.TRANSFER_ERROR) {
      const status = Number(data.status);
      if (status === 1) this.waitBackup();
      else if (status === 2) {
        this.setStage("mobile_idle", "Điện thoại đang tạm dừng - mở Zalo trên điện thoại để tiếp tục");
        this.arm(BACKUP_TIMEOUT_MS, "Hết thời gian chờ điện thoại gửi dữ liệu");
      } else if (Number(data.error_code || 0) !== 0) {
        this.finish("failed", `Điện thoại không tạo được bản sao lưu (mã ${String(data.error_code)}${data.error_msg ? `: ${String(data.error_msg)}` : ""})`);
      }
    } else if (e.type === SyncEventType.SYNCMSG_INFO) {
      this.clearTimer();
      this.importing = true;
      void this.runImport(e.data as TSyncEventSyncMsgInfo);
    }
  }

  private waitBackup(): void {
    this.setStage("waiting_backup", "Điện thoại đang chuẩn bị dữ liệu tin nhắn - giữ Zalo mở trên điện thoại...");
    this.arm(BACKUP_TIMEOUT_MS, "Hết thời gian chờ điện thoại gửi dữ liệu");
  }

  private async runImport(info: TSyncEventSyncMsgInfo): Promise<void> {
    const started = Date.now();
    const stats = emptyStats();
    const workDir = path.join(this.d.workDir, String(started));
    try {
      const dbInfo = typeof info.db_info === "string" ? (JSON.parse(info.db_info || "{}") as SyncDbInfo) : (info.db_info ?? {});
      this.d.log.info({ backup: describeBackupInfo(info, dbInfo) }, "Điện thoại đã gửi bản sao lưu");
      if (Number(dbInfo.db_format ?? 0) !== 1) {
        throw new Error(`Định dạng sao lưu chưa hỗ trợ (db_format=${String(dbInfo.db_format)}). Cập nhật Zalo trên điện thoại rồi thử lại.`);
      }
      fs.mkdirSync(workDir, { recursive: true });
      const cryptPath = path.join(workDir, "backup.db.crypt");
      this.setStage("downloading", "Đang tải dữ liệu từ máy chủ Zalo...");
      const ctx = this.d.api.getContext() as unknown as { userAgent: string; cookie: { getCookieString: (u: string) => Promise<string> } };
      const cookie = await ctx.cookie.getCookieString("https://chat.zalo.me/").catch(() => "");
      const download = {
        url: String(info.url || ""),
        userAgent: ctx.userAgent,
        sessionCookie: cookie,
        destPath: cryptPath,
        expectedSize: Number(info.file_size) || 0,
        onProgress: (p: number) => this.setProgress(p),
        shouldAbort: () => this.cancelled,
        log: (m: string) => this.d.log.warn(m),
      };
      await downloadBackupWithRetry(download, {
        onRetry: (retry, of, err) => {
          this.d.log.warn({ retry, of, error: err.message }, "Tải bản sao lưu hỏng - thử lại sau 5 giây");
          this.setStage("downloading", `Máy chủ Zalo chưa trả bản sao lưu - thử lại sau 5 giây (lần ${retry}/${of})...`);
        },
      });
      if ((await verifyChecksum(cryptPath, info.checksum_code || info.checksum)) === false) this.d.log.warn("Checksum bản sao lưu không khớp, vẫn thử giải mã");
      if (this.cancelled) throw new MobileSyncCancelled();

      this.setStage("decrypting", "Đang giải mã dữ liệu tin nhắn...");
      const { aesKey } = decryptBackupKey(this.keys!.privateKey, info.encrypted_key);
      const extracted = await extractZdbBackup({
        cryptPath,
        outDir: path.join(workDir, "db"),
        aesKey,
        shouldAbort: () => this.cancelled,
        onProgress: (p) => this.setProgress(p.totalBytes ? (p.processedBytes / p.totalBytes) * 100 : 0),
      });
      fs.rmSync(cryptPath, { force: true });
      // Chỉ tên + cỡ + số dòng chat của file không nhập (dò hội thoại bị bỏ sót, vd My Documents)
      this.d.log.info({ unimported: describeUnimportedBackupFiles(extracted.files, extracted.skippedEntries) }, "File trong bản sao lưu kho không nhập");

      const range = this.status_!.range ?? { fromTs: null, toTs: null };
      await importMobileBackupFiles(extracted.files, {
        db: this.d.db,
        getNoisedIds: (p) => this.api.getNoisedIds(p),
        ownNoiseId: String(this.d.api.getOwnId()),
        ownPlainId: String(info.uid ?? ""),
        range: { fromTs: range.fromTs ?? 0, toTs: range.toTs ?? 0 },
        stats,
        log: this.d.log,
        shouldAbort: () => this.cancelled,
        onProgress: (p) => this.setProgress(p),
        onStage: (m) => this.setStage("importing", m),
      });
      stats.durationMs = Date.now() - started;
      this.d.log.info({ stats }, "Đồng bộ từ điện thoại xong");
      this.finish("completed", `Đã nhập ${stats.messagesImported} tin mới từ ${stats.conversationsResolved} hội thoại`, stats);
    } catch (err) {
      stats.durationMs = Date.now() - started;
      if (this.cancelled || err instanceof MobileSyncCancelled) this.finish("cancelled", "Đã hủy đồng bộ", stats);
      else {
        this.d.log.error({ err }, "Đồng bộ từ điện thoại hỏng");
        this.finish("failed", err instanceof Error ? err.message : String(err), stats);
      }
    } finally {
      // Bản sao lưu chứa toàn bộ lịch sử: không để lại trên đĩa
      fs.rmSync(workDir, { recursive: true, force: true });
      this.importing = false;
    }
  }

  private async cancelOnServer(): Promise<void> {
    if (!this.status_ || !WAITING.includes(this.status_.stage) || !this.keys) return;
    await this.api.cancelPullMobile({ public_key: this.keys.publicKey, pc_name: DEFAULT_SYNC_PC_NAME }).catch((err: unknown) => {
      this.d.log.warn({ err }, "Hủy yêu cầu đồng bộ trên máy chủ thất bại");
    });
  }

  private arm(ms: number, message: string): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.status_ || !WAITING.includes(this.status_.stage) || this.importing) return;
      void this.cancelOnServer().finally(() => this.finish("failed", message));
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStage(stage: MobileSyncStage, message: string): void {
    if (this.status_) this.status_ = { ...this.status_, stage, message, progress: 0, updatedAt: Date.now() };
  }

  private setProgress(p: number): void {
    if (this.status_) this.status_ = { ...this.status_, progress: Math.max(0, Math.min(100, Math.round(p))), updatedAt: Date.now() };
  }

  private finish(stage: MobileSyncStage, message: string, stats?: MobileSyncStats): void {
    this.clearTimer();
    if (this.keys) this.keys.privateKey = "";
    if (!this.status_) return;
    this.status_ = {
      ...this.status_,
      stage,
      message,
      stats,
      error: stage === "failed" ? message : undefined,
      progress: stage === "completed" ? 100 : this.status_.progress,
      updatedAt: Date.now(),
    };
  }
}
