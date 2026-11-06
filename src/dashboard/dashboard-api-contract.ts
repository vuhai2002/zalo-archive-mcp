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

// Đăng nhập dashboard, phiên Zalo, danh sách nick: dashboard-auth-and-account-contract.ts
export type * from "./dashboard-auth-and-account-contract.js";

// ---------- Tổng quan / thống kê ----------
// GET /api/overview?days=30
export type DailyCount = { day: string /* YYYY-MM-DD theo timeZone */; incoming: number; outgoing: number };
export type TopThread = { threadId: string; threadType: ThreadKind; name: string | null; messages: number };
export type ListenerGap = {
  from: string;
  to: string | null;
  closeCode: number | null;
  suspected?: boolean;
  asleep?: boolean;
  /** Daemon không chạy (tắt máy, khởi động lại daemon) */
  daemonStopped?: boolean;
};
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
  recentEvents: ConnectionEvent[]; // 40 sự kiện kết nối gần nhất
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
  /** My Documents của Zalo (cất đồ riêng): dòng phụ như Zalo thay vì "Người lạ" */
  isMyDocuments: boolean;
  lastMessageAt: string | null;
  messageCount: number;
  /** Đã ghim lên đầu danh sách (ghim trong kho, không phải trên Zalo) */
  pinned: boolean;
};
// POST /api/threads/:threadId/pin  { pinned: boolean } -> { pinned }  (404 nếu không có hội thoại)

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
  /**
   * Link hết hạn: "waiting" = đang chờ lượt xin Zalo cấp lại; "deleted" = Zalo đã xóa file khỏi máy chủ
   * (như Zalo hiện "Ảnh đã hết hạn"), không cứu được; "gave_up" = đã xin mà vẫn không tải được vì lý do khác
   */
  renewState: "waiting" | "deleted" | "gave_up" | null;
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
  /** Định dạng chữ kiểu Zalo trên `text` (vị trí theo UTF-16); rỗng với tin chữ thường */
  textStyles: TextStyleSpan[];
  /** Tin cuộc gọi: `text` là "tiêu đề\nthời lượng"; cuộc gọi tới mình mà không nghe thì tô đỏ */
  call: { missedIncoming: boolean } | null;
  /** Ảnh thuộc album (nhiều ảnh gửi cùng lúc): cùng `id` thì gộp một khung lưới, xếp theo `index` */
  album: { id: string; index: number; total: number } | null;
  /** Thẻ link như Zalo (chỉ link http(s)): hiện thay cho chữ ghép "tiêu đề / link / mô tả" */
  link: { url: string; title: string | null; description: string | null; domain: string } | null;
  /**
   * Danh thiếp Zalo: tên, avatar, số điện thoại (nếu người gửi kèm), ảnh mã QR - ảnh chỉ link https CDN Zalo.
   * `threadId` khi người đó có hội thoại 1-1 trong kho (nút mở hội thoại)
   */
  contactCard: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    phone: string | null;
    qrUrl: string | null;
    threadId: string | null;
  } | null;
  /** Tin trả lời: ô trích dẫn. `id` = số tin gốc trong kho (bấm để nhảy tới); null khi tin gốc không có trong kho */
  quote: { id: number | null; senderName: string | null; isSelf: boolean; text: string } | null;
  /** Tin video: thời lượng (ms) + kích thước, để vẽ ô đúng tỉ lệ và hiện "00:33" như Zalo */
  video: { durationMs: number | null; width: number | null; height: number | null } | null;
  /** Thông báo nhóm (`group_event`): avatar nhỏ đứng trước câu - người được nhắc tới, hoặc ảnh Zalo gửi kèm */
  noticeAvatar: { userId: string | null; name: string | null; url: string | null } | null;
  /** Cảm xúc trên tin như Zalo, gộp theo loại; `emoji` null = mã Zalo chưa biết (hiện `icon`) */
  reactions: Array<{ icon: string; emoji: string | null; count: number; mine: boolean; names: string[] }>;
  attachments: AttachmentInfo[];
};

/** Một đoạn chữ có định dạng: đậm / nghiêng / gạch / màu "#rrggbb" / cỡ chữ (đã lọc ở máy chủ) */
export type TextStyleSpan = {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  size: "small" | "big" | null;
};

// GET /api/threads/:threadId/messages?beforeId=&afterId=&aroundId=&limit=50
//   -> tin theo thời gian TĂNG dần; trang cũ hơn: beforeId = messages[0].id; hết khi messages rỗng.
//   afterId: các tin MỚI hơn (cuộn xuống sau khi nhảy tới tin cũ). aroundId: một trang quanh tin đó
//   (nhảy tới tin từ kết quả tìm kiếm); tin không thuộc hội thoại thì 404
export type ThreadMessagesResponse = {
  thread: ThreadSummary & { memberAvatars: MemberAvatar[]; memberCount: number | null };
  messages: ArchivedMessage[];
};

// GET /api/search?q=&threadId=&senderId=&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&files=only|exclude&offset=0&limit=50
//   (mới nhất trước). Không có q thì phải có senderId hoặc ngày. files: chỉ tin có file / bỏ tin có file.
//   filter=mentions: tin người khác nhắc mình (@mình, @Tất cả); filter=reactions: tin của mình được thả
//   cảm xúc (tin vừa được thả gần nhất trước) - hai bộ lọc này bỏ qua các tham số khác trừ offset/limit
export type SearchFilter = "mentions" | "reactions";
export type SearchResult = ArchivedMessage & { threadName: string | null; threadIsFriend: boolean; threadAvatarUrl: string | null };
export type SearchResponse = { messages: SearchResult[] };

// GET /api/threads/:threadId/senders  -> người đã gửi tin trong hội thoại (bộ lọc "Người gửi"), nhiều tin nhất trước
export type ThreadSender = { senderId: string; name: string | null; avatarUrl: string | null; isSelf: boolean; count: number };
export type ThreadSendersResponse = { senders: ThreadSender[] };

// GET /api/threads/:threadId/shared?kind=visual|file&limit=8&offset=0  (mới nhất trước)
// Ảnh/video (visual) hoặc file đã gửi trong hội thoại - bảng "Thông tin hội thoại" kiểu Zalo PC
export type SharedAttachment = AttachmentInfo & {
  sentAt: string;
  /** Tin chứa file (cho cửa sổ xem ảnh: "Xem tin nhắn gốc", người gửi, cảm xúc) */
  messageId: number;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
  reactions: ArchivedMessage["reactions"];
};
export type ThreadSharedMediaResponse = { items: SharedAttachment[]; total: number };

// GET /api/threads/:threadId/links?limit=10&offset=0  (mới nhất trước) - mục Link của bảng thông tin:
//   thẻ link hoặc link trong chữ; chỉ http(s)
export type SharedLink = { messageId: number; url: string; title: string | null; domain: string; sentAt: string };
export type ThreadLinksResponse = { items: SharedLink[]; total: number };

// GET /api/threads/:threadId/members?limit=20&offset=0  (chỉ nhóm) - mục Thành viên: ai đã biết tên đứng
//   trước; total theo số thành viên Zalo báo
export type ThreadMember = { userId: string; name: string | null; avatarUrl: string | null; isSelf: boolean };
export type ThreadMembersResponse = { members: ThreadMember[]; total: number };

// GET /api/media/:attachmentId?v=<dấu sha256>  -> nội dung file (Content-Type đúng), 404 nếu chưa tải; ?v= chỉ để
// trình duyệt không lẫn bộ nhớ đệm giữa các nick / bản tải lại, máy chủ bỏ qua

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

/** Lấy lại media Zalo đã xóa từ bản Zalo PC đã tải về máy (chỉ đọc thư mục Zalo PC) */
export type ZaloPcImportProgress = { total: number; processed: number; recovered: number; notFound: number; rejected: number; failed: number };
export type ZaloPcMediaImportStatus = {
  /** Thư mục ZaloDownloads của nick (null khi không xác định được) */
  downloadsDir: string | null;
  /** Có thư mục đó trên máy */
  available: boolean;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  progress: ZaloPcImportProgress | null;
  error: string | null;
};
