/**
 * Phần HỢP ĐỒNG API về đăng nhập dashboard, phiên Zalo và danh sách nick (xem quy
 * ước chung ở dashboard-api-contract.ts). Chỉ có kiểu.
 */

// ---------- Mật khẩu dashboard ----------
// GET  /api/auth/status                     -> AuthStatusResponse (không cần phiên)
// POST /api/auth/setup   body SetupRequest  -> 200 MeResponse (đặt cookie) | 400 sai dữ liệu | 409 đã có mật khẩu
// POST /api/auth/login   body LoginRequest  -> 200 MeResponse (đặt cookie) | 401 sai | 409 chưa tạo | 429 sai quá nhiều lần
// POST /api/auth/logout  body {}            -> 200 { ok: true } (xóa cookie)
// GET  /api/auth/me                         -> 200 MeResponse | 401
export type AuthStatusResponse = { passwordSet: boolean; loggedIn: boolean };
export type SetupRequest = { password: string; confirm: string };
export type LoginRequest = { password: string };
export type MeResponse = { ok: true; timeZone: string; version: string };

// ---------- Nick Zalo ----------
// GET  /api/accounts                        -> AccountsResponse
// POST /api/accounts/:id/activate  {}       -> SessionStatus | 404 | 429 vừa đăng nhập, đợi chút
// Mỗi lúc chỉ MỘT nick chạy. Đổi nick: nick đang chạy dừng (giữ cookie), dữ liệu từng nick giữ riêng.
export type AccountSummary = {
  id: string;
  uid: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastActiveAt: string | null;
  /** Còn cookie đã lưu: chuyển sang là chạy được ngay, không cần quét QR */
  hasCredentials: boolean;
  active: boolean;
  /** Chỉ đọc: không soạn, không gửi gì qua nick này */
  readOnly: boolean;
};
export type AccountsResponse = { accounts: AccountSummary[] };

// ---------- Đồng bộ lịch sử từ điện thoại ----------
// GET  /api/mobile-sync                                  -> MobileSyncResponse
// POST /api/mobile-sync/start  { fromDate?, toDate? }    -> MobileSyncResponse | 400 | 409 nick chưa chạy / đang có lượt
// POST /api/mobile-sync/cancel {}                        -> MobileSyncResponse
// fromDate / toDate: "YYYY-MM-DD" theo giờ của kho; bỏ trống = không giới hạn phía đó.
export type MobileSyncStage =
  | "idle" | "requesting" | "waiting_confirm" | "waiting_backup" | "mobile_idle" | "downloading"
  | "decrypting" | "resolving_ids" | "importing" | "completed" | "failed" | "cancelled";
export type MobileSyncStatus = {
  stage: MobileSyncStage;
  /** 0-100 cho bước đang chạy (tải / giải mã / nhập) */
  progress: number;
  message: string;
  range?: { fromTs: number | null; toTs: number | null };
  error?: string;
  stats?: { conversations: number; conversationsResolved: number; conversationsUnresolved: number; messagesRead: number; messagesImported: number; messagesSkipped: number; messagesOutOfRange: number; durationMs: number };
  startedAt?: number;
  updatedAt: number;
};
export type MobileSyncResponse = { available: boolean; status: MobileSyncStatus | null };
export type MobileSyncStartRequest = { fromDate?: string; toDate?: string };

// ---------- Phiên Zalo của nick đang dùng ----------
// GET  /api/session                 -> SessionStatus (web hỏi lại mỗi 2 giây khi đang ở màn QR)
// POST /api/session/login-qr   {}   -> SessionStatus  (dừng nick đang chạy, tạo QR; quét nick nào thì dùng nick đó)
// POST /api/session/start      {}   -> SessionStatus  (đăng nhập lại bằng cookie đã lưu + chạy listener) | 429
// POST /api/session/stop       {}   -> SessionStatus  (dừng listener, giữ cookie; cũng là nút Hủy QR)
// POST /api/session/logout     {}   -> SessionStatus  (dừng + XÓA cookie đã lưu của nick đang dùng)
// Lỗi 429 = vừa đăng nhập xong, chặn đăng nhập dồn dập (Zalo dễ nghi là máy)
export type SessionState =
  | "logged_out" // chưa có cookie đã lưu (hoặc chưa có nick nào)
  | "qr_pending" // đang chờ quét QR
  | "logging_in" // đang đăng nhập bằng cookie
  | "running" // đã đăng nhập, listener chạy (xem listenerConnected)
  | "stopped" // có cookie nhưng người dùng đã dừng
  | "gave_up" // listener chớp-tắt liên tục, nghi phiên chết -> cần đăng nhập lại
  | "error"; // lỗi đăng nhập, xem lastError

export type QrStatus = "waiting_scan" | "scanned" | "expired" | "declined";

export type SessionStatus = {
  state: SessionState;
  /** Nick đang dùng; null khi chưa đăng nhập nick nào */
  account: AccountSummary | null;
  selfUid: string | null;
  displayName: string | null;
  listenerConnected: boolean;
  /** PNG base64 KHÔNG có tiền tố data:, chỉ có khi state = "qr_pending" */
  qrImageBase64: string | null;
  qrStatus: QrStatus | null;
  lastError: string | null;
  lastHeartbeatAt: string | null;
};
