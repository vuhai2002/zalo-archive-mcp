import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { QrStatus, SessionState, SessionStatus } from "../dashboard/dashboard-api-contract.js";
import { recordConnectionEvent } from "../storage/connection-event-store.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";
import { loginWithStoredCredentials, persistSessionCredentials, startQrLoginForWeb } from "../zalo/zalo-session-login.js";
import { startArchiveDaemon, type ArchiveHandle } from "./start-archive-daemon.js";

/** QR hết hạn thì tự tạo mã mới tối đa bấy nhiêu lần rồi dừng (người dùng bấm lại nếu cần) */
const MAX_QR_RETRIES = 3;

/** Các hàm chạm Zalo thật - tiêm vào được để test vòng đời phiên mà không cần mạng */
export type SessionIo = {
  loginWithStoredCredentials: typeof loginWithStoredCredentials;
  startQrLoginForWeb: typeof startQrLoginForWeb;
  persistSessionCredentials: typeof persistSessionCredentials;
  startArchiveDaemon: typeof startArchiveDaemon;
};

const REAL_IO: SessionIo = { loginWithStoredCredentials, startQrLoginForWeb, persistSessionCredentials, startArchiveDaemon };

/**
 * Quản lý phiên Zalo của daemon: đăng nhập bằng cookie đã lưu hoặc QR trên
 * dashboard, chạy/dừng khối lưu trữ, đăng xuất. Trạng thái ghi vào `meta` để
 * tiến trình MCP biết daemon có đang gửi được không.
 *
 * MỖI lần đăng nhập mang một số thế hệ (`gen`); Dừng / Đăng xuất / Hủy tăng số
 * này. Đăng nhập nào xong mà số đã đổi thì bị bỏ, không ghi cookie, không chạy
 * listener - nếu không, bấm Dừng đúng lúc đang đăng nhập sẽ bị nuốt, và Dừng
 * rồi Chạy liên tiếp có thể đẻ ra HAI listener cho một tài khoản.
 */
export class ZaloSessionManager {
  private state: SessionState = "logged_out";
  private archive: ArchiveHandle | null = null;
  private qrImage: string | null = null;
  private qrStatus: QrStatus | null = null;
  private abortQr: (() => void) | null = null;
  private lastError: string | null = null;
  private displayName: string | null = null;
  private gen = 0;
  private readonly io: SessionIo;

  constructor(
    private readonly d: { db: DatabaseSync; env: AppEnv; paths: AccountPaths; keyHex: string; log: Logger; io?: SessionIo },
  ) {
    this.io = d.io ?? REAL_IO;
    this.setState(fs.existsSync(d.paths.credentialsFile) ? "stopped" : "logged_out");
  }

  status(): SessionStatus {
    return {
      state: this.state,
      selfUid: getMeta(this.d.db, "self_uid"),
      displayName: this.displayName ?? getMeta(this.d.db, "self_display_name"),
      listenerConnected: this.archive?.isListenerConnected() ?? false,
      qrImageBase64: this.state === "qr_pending" ? this.qrImage : null,
      qrStatus: this.state === "qr_pending" ? this.qrStatus : null,
      lastError: this.lastError,
      lastHeartbeatAt: getMeta(this.d.db, "listener_heartbeat_at"),
    };
  }

  private busy(): boolean {
    return this.state === "running" || this.state === "logging_in" || this.state === "qr_pending";
  }

  /** Đăng nhập bằng cookie đã lưu rồi chạy khối lưu trữ */
  async start(): Promise<void> {
    if (this.busy()) return;
    if (!fs.existsSync(this.d.paths.credentialsFile)) return this.setState("logged_out");
    const my = ++this.gen;
    this.lastError = null;
    this.setState("logging_in");
    try {
      const api = await this.io.loginWithStoredCredentials(this.d.paths.credentialsFile, this.d.keyHex);
      await this.onLoggedIn(api, my);
    } catch (err) {
      this.fail(err, "Đăng nhập bằng cookie đã lưu thất bại - có thể cần quét QR lại", my);
    }
  }

  /** Bắt đầu đăng nhập QR (không chờ). Ảnh QR lấy qua `status()`. */
  startQrLogin(): void {
    if (this.busy()) return;
    const my = ++this.gen;
    let retries = 0;
    this.qrImage = null;
    this.qrStatus = "waiting_scan";
    this.lastError = null;
    this.setState("qr_pending");
    const flow = this.io.startQrLoginForWeb((e) => {
      if (my !== this.gen) return;
      if (e.type === "qr") {
        this.qrImage = e.imageBase64;
        this.qrStatus = "waiting_scan";
      } else if (e.type === "scanned") {
        this.qrStatus = "scanned";
      } else if (e.type === "declined") {
        this.qrStatus = "declined";
      } else if (e.type === "expired") {
        this.qrStatus = "expired";
        if (++retries <= MAX_QR_RETRIES) e.retry();
        else e.abort();
      }
    });
    this.abortQr = flow.abort;
    flow.done
      .then(async (api) => {
        if (my !== this.gen) return;
        this.abortQr = null;
        if (!api) return this.fail(new Error("Đăng nhập QR không hoàn tất"), "Đăng nhập QR không thành công", my);
        this.setState("logging_in");
        try {
          await this.onLoggedIn(api, my);
        } catch (err) {
          this.fail(err, "Đã đăng nhập nhưng không khởi động được khối lưu trữ", my);
        }
      })
      .catch((err) => {
        if (my !== this.gen) return;
        const declined = this.qrStatus === "declined";
        this.abortQr = null;
        this.fail(declined ? new Error("Bạn đã từ chối đăng nhập trên điện thoại") : err, "Đăng nhập QR không thành công", my);
      });
  }

  /** Dừng listener + các khối, giữ cookie để chạy lại sau. Hủy luôn mọi lần đăng nhập đang dở. */
  stop(): void {
    this.gen++;
    this.abortQr?.();
    this.abortQr = null;
    this.archive?.stop();
    this.archive = null;
    this.setState(fs.existsSync(this.d.paths.credentialsFile) ? "stopped" : "logged_out");
  }

  /** Dừng và XÓA cookie đã lưu: lần sau phải quét QR */
  logout(): void {
    this.stop();
    fs.rmSync(this.d.paths.credentialsFile, { force: true });
    this.setState("logged_out");
  }

  private async onLoggedIn(api: API, my: number): Promise<void> {
    const selfUid = String(api.getOwnId());
    const info = (await api.fetchAccountInfo().catch(() => null)) as { profile?: { displayName?: string } } | null;
    // Kiểm SAU lần await cuối: người dùng có thể vừa bấm Dừng / Đăng xuất / Hủy
    if (my !== this.gen) return;

    this.io.persistSessionCredentials(api, this.d.paths.credentialsFile, this.d.keyHex);
    this.displayName = info?.profile?.displayName ?? null;
    setMeta(this.d.db, "self_uid", selfUid);
    if (this.displayName) setMeta(this.d.db, "self_display_name", this.displayName);
    recordConnectionEvent(this.d.db, "login", { detail: `uid ${selfUid}` });
    this.d.log.info({ selfUid, displayName: this.displayName }, "Đã đăng nhập Zalo");

    const handle = this.io.startArchiveDaemon({
      api,
      db: this.d.db,
      env: this.d.env,
      paths: this.d.paths,
      keyHex: this.d.keyHex,
      log: this.d.log,
      onGaveUp: () => {
        handle.stop();
        if (this.archive !== handle) return;
        this.archive = null;
        this.lastError = "Listener nối rồi rớt liên tục - phiên Zalo có thể đã hết hạn. Đăng nhập lại bằng QR.";
        this.setState("gave_up");
      },
    });
    this.archive = handle;
    this.lastError = null;
    this.setState("running");
  }

  private fail(err: unknown, context: string, my: number): void {
    if (my !== this.gen) return;
    const message = err instanceof Error ? err.message : String(err);
    this.lastError = `${context}: ${message}`;
    this.d.log.error({ err }, context);
    this.setState("error");
  }

  private setState(state: SessionState): void {
    this.state = state;
    setMeta(this.d.db, "daemon_session_state", state);
  }
}
