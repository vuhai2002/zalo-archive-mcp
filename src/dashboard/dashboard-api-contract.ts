/**
 * HỢP ĐỒNG API giữa dashboard server (src/dashboard) và giao diện web (web/).
 * Chỉ có KIỂU, không có code chạy, để web import thẳng mà không kéo theo
 * node:sqlite hay zca-js. Đổi gì ở đây thì sửa cả hai phía.
 *
 * Quy ước chung:
 * - Mọi route nằm dưới `/api`. Trả JSON. Lỗi: HTTP 4xx/5xx + `ApiError`.
 * - Đăng nhập dashboard bằng cookie phiên (httpOnly) - `fetch(..., { credentials: "same-origin" })`.
 *   Chưa đăng nhập: 401 ở mọi route trừ `/api/auth/*`.
 * - Route ghi (POST/PUT) bắt buộc `Content-Type: application/json` (chặn CSRF dạng form).
 * - Mọi mốc thời gian là chuỗi ISO UTC; web tự hiển thị theo `timeZone` lấy từ `/api/auth/me`.
 */

export type ApiError = { error: string };

export type ThreadKind = "user" | "group";

// ---------- Đăng nhập dashboard ----------
// POST /api/auth/login   body LoginRequest  -> 200 MeResponse (đặt cookie) | 401 ApiError
// POST /api/auth/logout  body {}            -> 200 { ok: true } (xóa cookie)
// GET  /api/auth/me                         -> 200 MeResponse | 401
export type LoginRequest = { password: string };
export type MeResponse = { ok: true; accountId: string; timeZone: string; version: string };

// ---------- Phiên Zalo (đăng nhập QR, listener) ----------
// GET  /api/session                 -> SessionStatus (web hỏi lại mỗi 2 giây khi đang ở màn QR)
// POST /api/session/login-qr   {}   -> SessionStatus  (bắt đầu tạo QR; ảnh có trong lần GET sau)
// POST /api/session/start      {}   -> SessionStatus  (đăng nhập lại bằng cookie đã lưu + chạy listener)
// POST /api/session/stop       {}   -> SessionStatus  (dừng listener, giữ cookie)
// POST /api/session/logout     {}   -> SessionStatus  (dừng + XÓA cookie đã lưu; phải quét QR lại)
export type SessionState =
  | "logged_out" // chưa có cookie đã lưu
  | "qr_pending" // đang chờ quét QR
  | "logging_in" // đang đăng nhập bằng cookie
  | "running" // đã đăng nhập, listener chạy (xem listenerConnected)
  | "stopped" // có cookie nhưng người dùng đã dừng
  | "gave_up" // listener chớp-tắt liên tục, nghi phiên chết -> cần đăng nhập lại
  | "error"; // lỗi đăng nhập, xem lastError

export type QrStatus = "waiting_scan" | "scanned" | "expired" | "declined";

export type SessionStatus = {
  state: SessionState;
  selfUid: string | null;
  displayName: string | null;
  listenerConnected: boolean;
  /** PNG base64 KHÔNG có tiền tố data:, chỉ có khi state = "qr_pending" */
  qrImageBase64: string | null;
  qrStatus: QrStatus | null;
  lastError: string | null;
  lastHeartbeatAt: string | null;
};

// ---------- Tổng quan / thống kê ----------
// GET /api/overview?days=30
export type DailyCount = { day: string /* YYYY-MM-DD theo timeZone */; incoming: number; outgoing: number };
export type TopThread = { threadId: string; threadType: ThreadKind; name: string | null; messages: number };
export type ListenerGap = { from: string; to: string | null; closeCode: number | null; suspected?: boolean };
export type ConnectionEvent = { at: string; kind: string; code: number | null; detail: string | null };

export type OverviewResponse = {
  totals: {
    messages: number;
    threads: number;
    groups: number;
    friends: number;
    messagesToday: number;
    sentByMeToday: number;
    oldestMessageAt: string | null;
    newestMessageAt: string | null;
  };
  bySource: Record<string, number>;
  media: Record<string, number>; // theo trạng thái: pending, done, failed...
  mediaBytes: number;
  outbox: Record<string, number>; // theo trạng thái
  daily: DailyCount[];
  topThreads: TopThread[]; // 10 hội thoại nhiều tin nhất trong `days` ngày
  gaps: ListenerGap[]; // 7 ngày gần nhất
  recentEvents: ConnectionEvent[]; // 20 sự kiện kết nối gần nhất
};

// ---------- Hội thoại + tin ----------
// GET /api/threads?query=&limit=50&offset=0
//   Không có query: chỉ hội thoại ĐÃ có tin. Có query: tìm cả bạn bè chưa từng nhắn (để gửi tin mới).
export type ThreadSummary = {
  threadId: string;
  threadType: ThreadKind;
  name: string | null;
  /** Link avatar trên CDN Zalo (tải thẳng từ trình duyệt); null thì hiện chữ cái đầu */
  avatarUrl: string | null;
  isFriend: boolean;
  lastMessageAt: string | null;
  messageCount: number;
};
/** Tin cuối của hội thoại, để hiện dòng xem trước kiểu Zalo ("Bạn: 📎 file.mp4") */
export type LastMessagePreview = {
  isSelf: boolean;
  senderName: string | null;
  msgType: string;
  text: string;
  attachmentKind: AttachmentInfo["kind"] | null;
  attachmentName: string | null;
  recalled: boolean;
};
export type MemberAvatar = { userId: string; name: string | null; avatarUrl: string | null };
/** Một dòng trong danh sách hội thoại: thêm tin cuối + avatar vài thành viên (ghép avatar nhóm) */
export type ThreadListItem = ThreadSummary & {
  lastMessage: LastMessagePreview | null;
  /** Nhóm không có ảnh riêng: tối đa 4 thành viên đầu để ghép avatar; memberCount = tổng thành viên */
  memberAvatars: MemberAvatar[];
  memberCount: number | null;
};
export type ThreadListResponse = { threads: ThreadListItem[]; total: number };

export type AttachmentInfo = {
  id: number;
  /** sticker: ảnh sticker Zalo đã tải về kho - hiện như ảnh, không khung bong bóng */
  kind: "photo" | "video" | "file" | "voice" | "gif" | "sticker";
  status: "pending" | "downloading" | "done" | "failed" | "too_large" | "blocked_host";
  fileName: string | null;
  sizeBytes: number | null;
  /** Có khi status = "done": GET url này (cùng cookie) để xem/tải file */
  url: string | null;
  mime: string | null;
};

export type ArchivedMessage = {
  id: number;
  msgId: string;
  threadId: string;
  threadType: ThreadKind;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
  msgType: string;
  text: string;
  quoteMsgId: string | null;
  sentAt: string;
  recalledAt: string | null;
  source: string;
  attachments: AttachmentInfo[];
};

// GET /api/threads/:threadId/messages?beforeId=&limit=50
//   -> tin theo thời gian TĂNG dần; trang cũ hơn: beforeId = messages[0].id; hết khi messages rỗng
export type ThreadMessagesResponse = {
  thread: ThreadSummary & { memberAvatars: MemberAvatar[]; memberCount: number | null };
  messages: ArchivedMessage[];
};

// GET /api/search?q=&threadId=&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&limit=50  (mới nhất trước)
export type SearchResult = ArchivedMessage & { threadName: string | null; threadIsFriend: boolean };
export type SearchResponse = { messages: SearchResult[] };

// GET /api/media/:attachmentId  -> nội dung file (Content-Type đúng), 404 nếu chưa tải

// ---------- Gửi + hàng đợi ----------
export type OutboxStatus = "draft" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "rejected";
export type OutboxMode = "single" | "batch";

export type OutboxItem = {
  id: number;
  threadId: string;
  threadType: ThreadKind;
  threadName: string | null;
  text: string;
  mode: OutboxMode;
  batchId: string | null;
  notBefore: string | null;
  status: OutboxStatus;
  createdBy: "mcp" | "cli" | "dashboard";
  note: string | null;
  createdAt: string;
  finishedAt: string | null;
  sentMsgId: string | null;
  error: string | null;
};

// GET  /api/outbox?status=&limit=100           -> { items: OutboxItem[] }
// POST /api/outbox  body SendRequest            -> 200 OutboxItem | 400 ApiError
//      when "now": vào hàng đợi đã duyệt, daemon gửi trong vài giây (web hỏi lại GET /api/outbox/:id)
//      when "schedule": cần sendDate + sendTime (giờ của kho)
//      when "draft": chỉ lưu nháp, chờ bấm Duyệt
// GET  /api/outbox/:id                          -> OutboxItem
// POST /api/outbox/:id/approve  {}              -> OutboxItem (draft -> approved)
// POST /api/outbox/:id/cancel   {}              -> OutboxItem (draft/approved -> cancelled)
export type SendRequest = {
  threadId: string;
  text: string;
  when: "now" | "schedule" | "draft";
  sendDate?: string; // YYYY-MM-DD
  sendTime?: string; // HH:mm
};
export type OutboxListResponse = { items: OutboxItem[] };

// ---------- Cài đặt gửi + khóa khẩn cấp ----------
// GET /api/settings            -> SettingsResponse
// PUT /api/settings  body Partial<SendSettings> -> SettingsResponse | 400 ApiError
// POST /api/kill-switch  body { killed: boolean; reason?: string } -> SettingsResponse
export type SendSettings = {
  /** Tin lẻ: hai tin bất kỳ cách nhau ít nhất bấy nhiêu giây */
  singleMinGapSeconds: number;
  /** Gửi nhiều người (lô): mỗi tin cách nhau ngẫu nhiên trong khoảng này */
  batchMinGapSeconds: number;
  batchMaxGapSeconds: number;
  /** Lô chỉ gửi trong khung giờ [start, end) */
  batchWindowStartHour: number;
  batchWindowEndHour: number;
  /** Tối đa số tin của lô mỗi ngày (tin lẻ không tính) */
  batchDailyCap: number;
  /** Một lô tối đa bao nhiêu người */
  batchMaxItems: number;
  /** Tin hẹn giờ / đã duyệt trễ quá bấy nhiêu giờ thì bỏ */
  maxLatenessHours: number;
};
export type SettingsResponse = {
  settings: SendSettings;
  killSwitch: { killed: boolean; reason: string | null; changedAt: string };
};
