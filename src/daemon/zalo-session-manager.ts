import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { SessionState } from "../dashboard/dashboard-api-contract.js";
import { recordConnectionEvent } from "../storage/connection-event-store.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";
import { loginWithStoredCredentials, persistSessionCredentials, startQrLoginForWeb } from "../zalo/zalo-session-login.js";
import { startArchiveDaemon, type ArchiveHandle } from "./start-archive-daemon.js";

/** Các hàm chạm Zalo thật - tiêm vào được để test vòng đời phiên mà không cần mạng */
export type SessionIo = {
  loginWithStoredCredentials: typeof loginWithStoredCredentials;
  startQrLoginForWeb: typeof startQrLoginForWeb;
  persistSessionCredentials: typeof persistSessionCredentials;
  startArchiveDaemon: typeof startArchiveDaemon;
};

export const REAL_SESSION_IO: SessionIo = { loginWithStoredCredentials, startQrLoginForWeb, persistSessionCredentials, startArchiveDaemon };

/** Nick là ai, đọc được lúc đăng nhập - để danh sách nick hiện đúng tên + avatar */
export type SessionIdentity = { uid: string; displayName: string | null; avatarUrl: string | null };

/** Trạng thái phiên của MỘT nick (phần QR do ZaloAccountManager lo) */
export type NickSessionStatus = {
  state: Exclude<SessionState, "qr_pending">;
  selfUid: string | null;
  displayName: string | null;
  listenerConnected: boolean;
  lastError: string | null;
  lastHeartbeatAt: string | null;
};

/**
 * Phiên Zalo của MỘT nick: đăng nhập bằng cookie đã lưu, hoặc nhận phiên vừa quét
 * QR xong (`attach`); chạy/dừng khối lưu trữ; đăng xuất. Trạng thái ghi vào `meta`
 * của DB nick đó để tiến trình MCP biết daemon có đang gửi được không.
 *
 * MỖI lần đăng nhập mang một số thế hệ (`gen`); Dừng / Đăng xuất tăng số này. Đăng
 * nhập nào xong mà số đã đổi thì bị bỏ, không ghi cookie, không chạy listener - nếu
 * không, bấm Dừng đúng lúc đang đăng nhập sẽ bị nuốt, và Dừng rồi Chạy liên tiếp
 * có thể đẻ ra HAI listener cho một tài khoản.
 */
export class ZaloSessionManager {
  private state: NickSessionStatus["state"] = "logged_out";
  private archive: ArchiveHandle | null = null;
  private lastError: string | null = null;
  private displayName: string | null = null;
  private gen = 0;
  private readonly io: SessionIo;

  constructor(
    private readonly d: {
      db: DatabaseSync;
      env: AppEnv;
      paths: AccountPaths;
      keyHex: string;
      log: Logger;
      io?: SessionIo;
      onIdentity?: (who: SessionIdentity) => void;
    },
  ) {
    this.io = d.io ?? REAL_SESSION_IO;
    this.setState(this.hasCredentials() ? "stopped" : "logged_out");
  }

  hasCredentials(): boolean {
    return fs.existsSync(this.d.paths.credentialsFile);
  }

  status(): NickSessionStatus {
    return {
      state: this.state,
      selfUid: getMeta(this.d.db, "self_uid"),
      displayName: this.displayName ?? getMeta(this.d.db, "self_display_name"),
      listenerConnected: this.archive?.isListenerConnected() ?? false,
      lastError: this.lastError,
      lastHeartbeatAt: getMeta(this.d.db, "listener_heartbeat_at"),
    };
  }

  /** Đồng bộ từ điện thoại của phiên đang chạy; null khi nick không chạy */
  mobileSync(): ArchiveHandle["mobileSync"] | null {
    return this.archive?.mobileSync ?? null;
  }

  isBusy(): boolean {
    return this.state === "running" || this.state === "logging_in";
  }

  /** Đăng nhập bằng cookie đã lưu rồi chạy khối lưu trữ */
  async start(): Promise<void> {
    if (this.isBusy()) return;
    if (!this.hasCredentials()) return this.setState("logged_out");
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

  /** Nhận phiên vừa đăng nhập QR (đã chắc là nick này): lưu cookie rồi chạy khối lưu trữ */
  async attach(api: API): Promise<void> {
    this.stop();
    const my = ++this.gen;
    this.lastError = null;
    this.setState("logging_in");
    try {
      await this.onLoggedIn(api, my);
    } catch (err) {
      this.fail(err, "Đã đăng nhập nhưng không khởi động được khối lưu trữ", my);
    }
  }

  /** Dừng listener + các khối, giữ cookie để chạy lại sau. Hủy luôn lần đăng nhập đang dở. */
  stop(): void {
    this.gen++;
    this.archive?.stop();
    this.archive = null;
    this.setState(this.hasCredentials() ? "stopped" : "logged_out");
  }

  /** Dừng và XÓA cookie đã lưu: lần sau phải quét QR. Tin đã lưu trong kho giữ nguyên. */
  logout(): void {
    this.stop();
    fs.rmSync(this.d.paths.credentialsFile, { force: true });
    this.lastError = null;
    this.setState("logged_out");
  }

  private async onLoggedIn(api: API, my: number): Promise<void> {
    const selfUid = String(api.getOwnId());
    const info = (await api.fetchAccountInfo().catch(() => null)) as { profile?: { displayName?: string; avatar?: string } } | null;
    // Kiểm SAU lần await cuối: người dùng có thể vừa bấm Dừng / Đăng xuất / đổi nick
    if (my !== this.gen) return;

    this.io.persistSessionCredentials(api, this.d.paths.credentialsFile, this.d.keyHex);
    this.displayName = info?.profile?.displayName?.trim() || null;
    setMeta(this.d.db, "self_uid", selfUid);
    if (this.displayName) setMeta(this.d.db, "self_display_name", this.displayName);
    recordConnectionEvent(this.d.db, "login", { detail: `uid ${selfUid}` });
    this.d.log.info({ selfUid, displayName: this.displayName }, "Đã đăng nhập Zalo");
    this.d.onIdentity?.({ uid: selfUid, displayName: this.displayName, avatarUrl: info?.profile?.avatar?.trim() || null });

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

  private setState(state: NickSessionStatus["state"]): void {
    this.state = state;
    setMeta(this.d.db, "daemon_session_state", state);
  }
}
