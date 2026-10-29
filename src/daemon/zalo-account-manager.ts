import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { toAccountSummary, withLoginIdentity } from "../accounts/account-summary-and-identity.js";
import {
  activeAccount,
  findAccount,
  replaceAccount,
  setAccountReadOnly,
  setActiveAccountId,
  upsertAccountByUid,
  writeAccountRegistry,
  type AccountRecord,
  type AccountRegistry,
} from "../accounts/zalo-account-registry.js";
import { accountPaths, type AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import type { AccountSummary, SessionStatus } from "../dashboard/dashboard-api-contract.js";
import { ZaloLoginCooldown } from "./zalo-login-cooldown.js";
import { ZaloQrLoginFlow } from "./zalo-qr-login-flow.js";
import { REAL_SESSION_IO, ZaloSessionManager, type SessionIdentity, type SessionIo } from "./zalo-session-manager.js";

export class UnknownAccountError extends Error {}

export type ActiveAccountContext = { account: AccountRecord; paths: AccountPaths; db: DatabaseSync };

type Deps = {
  env: AppEnv;
  dataDir: string;
  keyHex: string;
  log: Logger;
  registry: AccountRegistry;
  /** Mở DB một nick cho daemon (kèm dọn dẹp lần chạy trước) */
  openDb: (databaseFile: string, accountId: string) => DatabaseSync;
  io?: SessionIo;
  now?: () => number;
};

/**
 * Các nick Zalo của daemon. Mỗi lúc chỉ MỘT nick chạy (một listener):
 * - Đổi nick: dừng nick đang chạy (GIỮ cookie), nick kia có cookie thì đăng nhập luôn.
 * - Đăng nhập QR: dừng nick đang chạy rồi mới tạo QR; quét nick nào thì dùng nick
 *   đó - uid đã có thì nối tiếp dữ liệu cũ, chưa có thì thêm nick mới.
 * - Mỗi lần đăng nhập (cookie hoặc QR) cách nhau tối thiểu ZALO_LOGIN_COOLDOWN_SECONDS.
 * DB mỗi nick mở một lần rồi giữ tới khi tắt daemon: request đang dở không bao giờ
 * gặp DB đã đóng.
 */
export class ZaloAccountManager {
  private registry: AccountRegistry;
  private readonly dbs = new Map<string, DatabaseSync>();
  private readonly sessions = new Map<string, ZaloSessionManager>();
  private readonly qr: ZaloQrLoginFlow;
  private readonly io: SessionIo;
  private readonly now: () => number;
  private readonly cooldown: ZaloLoginCooldown;

  constructor(private readonly d: Deps) {
    this.registry = d.registry;
    this.io = d.io ?? REAL_SESSION_IO;
    this.now = d.now ?? Date.now;
    this.qr = new ZaloQrLoginFlow(this.io.startQrLoginForWeb);
    this.cooldown = new ZaloLoginCooldown(d.env.ZALO_LOGIN_COOLDOWN_SECONDS * 1000, this.now);
  }

  /** Khởi động daemon: nick đang dùng có cookie thì đăng nhập luôn */
  async boot(): Promise<void> {
    const ctx = this.active();
    if (!ctx || !fs.existsSync(ctx.paths.credentialsFile)) return;
    this.cooldown.markLogin();
    await this.session(ctx.account.id).start();
  }

  active(): ActiveAccountContext | null {
    const account = activeAccount(this.registry);
    if (!account) return null;
    return { account, paths: accountPaths(this.d.dataDir, account.id), db: this.db(account.id) };
  }

  accounts(): AccountSummary[] {
    return this.registry.accounts.map((a) => this.summary(a));
  }

  status(): SessionStatus {
    const ctx = this.active();
    const qr = this.qr.snapshot();
    const nick = ctx ? this.session(ctx.account.id).status() : null;
    return {
      state: qr.pending ? "qr_pending" : qr.error && !nick?.lastError ? "error" : (nick?.state ?? "logged_out"),
      account: ctx ? this.summary(ctx.account) : null,
      selfUid: nick?.selfUid ?? null,
      displayName: nick?.displayName ?? null,
      listenerConnected: nick?.listenerConnected ?? false,
      qrImageBase64: qr.imageBase64,
      qrStatus: qr.status,
      lastError: qr.error ?? nick?.lastError ?? null,
      lastHeartbeatAt: nick?.lastHeartbeatAt ?? null,
    };
  }

  /** Dừng nick đang chạy rồi tạo QR (không chờ quét). Ảnh QR lấy qua `status()`. */
  startQrLogin(): void {
    this.cooldown.assertAllowed();
    this.activeSession()?.stop();
    this.qr.start(async (api) => this.adoptQrLogin(api));
  }

  /** Đồng bộ lịch sử từ điện thoại của nick đang chạy; null khi chưa chạy */
  mobileSync() {
    return this.activeSession()?.mobileSync() ?? null;
  }

  /** Chạy lại nick đang dùng bằng cookie đã lưu */
  async startActive(): Promise<void> {
    const ctx = this.active();
    if (!ctx) return;
    const s = this.session(ctx.account.id);
    if (s.isBusy() || !s.hasCredentials()) return;
    this.guardLogin();
    this.qr.cancel();
    await s.start();
  }

  /** Dừng nick đang dùng (giữ cookie); cũng là nút Hủy khi đang chờ quét QR */
  stopActive(): void {
    this.qr.cancel();
    this.activeSession()?.stop();
  }

  logoutActive(): void {
    this.qr.cancel();
    this.activeSession()?.logout();
  }

  /** Đổi sang nick khác. Có cookie thì đăng nhập luôn (tính là một lần đăng nhập). */
  async switchTo(id: string): Promise<void> {
    const target = findAccount(this.registry, id);
    if (!target) throw new UnknownAccountError(`Không có nick ${id}`);
    if (id === this.registry.activeAccountId) return;
    const canLogin = fs.existsSync(accountPaths(this.d.dataDir, id).credentialsFile);
    // Kiểm nhịp TRƯỚC khi đổi gì: bị chặn thì vẫn ở nguyên nick cũ
    if (canLogin) this.guardLogin();
    this.qr.cancel();
    this.activeSession()?.stop();
    this.saveRegistry(setActiveAccountId(this.registry, id));
    this.d.log.info({ account: id }, "Đã chuyển nick");
    if (canLogin) await this.session(id).start();
  }

  /** Nick ở chế độ Chỉ đọc. Nick không có trong danh sách: coi như chỉ đọc (không bao giờ mở nhầm) */
  isReadOnly(id: string): boolean {
    return findAccount(this.registry, id)?.readOnly ?? true;
  }

  setReadOnly(id: string, readOnly: boolean): void {
    if (!findAccount(this.registry, id)) throw new UnknownAccountError(`Không có nick ${id}`);
    this.saveRegistry(setAccountReadOnly(this.registry, id, readOnly));
    this.d.log.info({ account: id, readOnly }, readOnly ? "Nick chuyển sang Chỉ đọc" : "Nick được mở gửi tin");
  }

  shutdown(): void {
    this.qr.cancel();
    for (const s of this.sessions.values()) s.stop();
    for (const db of this.dbs.values()) db.close();
    this.dbs.clear();
  }

  private async adoptQrLogin(api: API): Promise<void> {
    this.cooldown.markLogin();
    const uid = String(api.getOwnId());
    const { registry, account, isNew } = upsertAccountByUid(this.registry, uid, new Date(this.now()).toISOString());
    this.saveRegistry(setActiveAccountId(registry, account.id));
    this.d.log.info({ account: account.id, isNew }, isNew ? "Đã thêm nick mới" : "Đăng nhập lại nick đã có");
    await this.session(account.id).attach(api);
  }

  /** Đăng nhập bằng cookie: kiểm nhịp rồi tính luôn là một lần đăng nhập */
  private guardLogin(): void {
    this.cooldown.assertAllowed();
    this.cooldown.markLogin();
  }

  private activeSession(): ZaloSessionManager | null {
    const id = this.registry.activeAccountId;
    return id ? this.session(id) : null;
  }

  private db(id: string): DatabaseSync {
    let db = this.dbs.get(id);
    if (!db) {
      db = this.d.openDb(accountPaths(this.d.dataDir, id).databaseFile, id);
      this.dbs.set(id, db);
    }
    return db;
  }

  private session(id: string): ZaloSessionManager {
    let s = this.sessions.get(id);
    if (!s) {
      s = new ZaloSessionManager({
        db: this.db(id),
        env: this.d.env,
        paths: accountPaths(this.d.dataDir, id),
        keyHex: this.d.keyHex,
        log: this.d.log.child({ account: id }),
        io: this.io,
        onIdentity: (who) => this.noteIdentity(id, who),
        isReadOnly: () => this.isReadOnly(id),
      });
      this.sessions.set(id, s);
    }
    return s;
  }

  /** Đăng nhập xong: cập nhật tên, avatar, lần dùng gần nhất trong danh sách nick */
  private noteIdentity(id: string, who: SessionIdentity): void {
    const current = findAccount(this.registry, id);
    if (!current) return;
    if (current.uid && current.uid !== who.uid) {
      this.d.log.warn({ account: id, expected: current.uid, got: who.uid }, "Cookie của nick này đăng nhập ra uid khác");
    }
    this.saveRegistry(replaceAccount(this.registry, withLoginIdentity(current, who, new Date(this.now()).toISOString())));
  }

  private summary(a: AccountRecord): AccountSummary {
    return toAccountSummary(a, this.d.dataDir, this.registry.activeAccountId);
  }

  private saveRegistry(next: AccountRegistry): void {
    writeAccountRegistry(this.d.dataDir, next);
    this.registry = next;
  }
}
