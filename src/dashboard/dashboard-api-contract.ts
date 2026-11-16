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
// Quản lý dữ liệu (dung lượng kho, xóa file giữ tin): storage-management-contract.ts
export type * from "./storage-management-contract.js";
// Cửa sổ Xem bình chọn nhóm (chỉ xem): poll-view-contract.ts
export type * from "./poll-view-contract.js";
import type { StorageOverviewResponse } from "./storage-management-contract.js";

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
  /** Zalo đã gửi bù khoảng này: đủ / có thể thiếu / chưa rõ (khoảng trước khi kho ghi kết quả lấy bù) / đã đồng bộ từ điện thoại */
  backfill?: "filled" | "incomplete" | "unknown" | "synced";
  /** Số tin Zalo gửi lại ở lượt lấy bù đủ */
  backfillItems?: number;
  /** Vì sao có thể thiếu */
  backfillDetail?: string;
  /** Số tin kho đang có, gửi trong khoảng này */
  messagesInGap?: number;
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
  /** Ảnh, video, file, tin thoại đã tải: dung lượng mỗi file một lần (file dùng chung giữa nhiều tin không cộng lặp) */
  mediaBytes: number;
  /** Thẻ "File đính kèm": cùng phép đếm + bản đo ổ với Cài đặt > Quản lý dữ liệu để hai nơi ra cùng một số */
  storage: {
    /** Ảnh, video, file, tin thoại đã tải về máy (theo tin, không tính sticker) */
    downloadedFiles: number;
    /** Đính kèm chưa tải được (link hết hạn, Zalo đã xóa) - không nằm trên máy */
    failedFiles: number;
    /** Bản đo dung lượng kho trên ổ lần gần nhất (null = chưa đo xong lần nào) */
    disk: StorageOverviewResponse["disk"];
  };
  outbox: Record<string, number>; // theo trạng thái
  daily: DailyCount[];
  topThreads: TopThread[]; // 10 hội thoại nhiều tin nhất trong `days` ngày
  gaps: ListenerGap[]; // 7 ngày gần nhất
  recentEvents: ConnectionEvent[]; // 40 sự kiện kết nối gần nhất
};

// ---------- Hội thoại + tin ----------
// GET /api/threads?query=&limit=50&offset=0&kind=group|friend  (kind: chỉ nhóm / chỉ bạn bè, cho hộp Chia sẻ)
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

/**
 * GET /api/labels: thẻ Phân loại mình gắn trên Zalo (daemon đồng bộ cùng lượt danh sách bạn bè, chỉ đọc), để chọn nhanh hội
 * thoại cho chế độ trình chiếu. `threadIds`: các hội thoại kho có trong thẻ. `syncedAt` null = chưa đồng bộ lần nào.
 */
export type ZaloLabelsResponse = {
  labels: Array<{ id: number; name: string; color: string | null; emoji: string | null; threadIds: string[] }>;
  syncedAt: string | null;
};

export type AttachmentInfo = {
  id: number;
  /** sticker: ảnh sticker Zalo đã tải về kho - hiện như ảnh, không khung bong bóng */
  kind: "photo" | "video" | "file" | "voice" | "gif" | "sticker";
  /** removed = người dùng đã xóa file khỏi kho (dọn dữ liệu), tin vẫn giữ */
  status: "pending" | "downloading" | "done" | "failed" | "too_large" | "blocked_host" | "removed";
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
  /**
   * Ảnh thuộc album (nhiều ảnh gửi cùng lúc): cùng `id` thì gộp một khung lưới, xếp theo `index`;
   * `width` / `height` = cỡ ảnh (xếp lưới theo tỉ lệ như Zalo), null khi tin không ghi
   */
  album: { id: string; index: number; total: number; width: number | null; height: number | null } | null;
  /**
   * Tin link như Zalo (chỉ link http(s)): `text` là chữ của tin (đầy đủ, hoặc chính link khi chỉ dán link), hiện thay
   * cho chữ ghép; bên dưới là thẻ xem trước: ảnh (https CDN Zalo, `thumbAspect` = rộng / cao), tên trang, mô tả, tên miền
   */
  link: {
    url: string;
    text: string;
    textStyles: TextStyleSpan[];
    title: string | null;
    description: string | null;
    domain: string;
    thumbUrl: string | null;
    thumbAspect: number | null;
  } | null;
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
  /** Thông báo nhóm (`group_event`): 0-4 avatar nhỏ ghép trước câu như Zalo PC - người được nhắc tới, hoặc ảnh Zalo gửi kèm */
  noticeAvatars: Array<{ userId: string | null; name: string | null; url: string | null }>;
  /** Thông báo nhóm: tổng số người câu nói tới (ô số trên avatar ghép, vd "9"); 0 với tin khác */
  noticePeople: number;
  /** Tin bình chọn (`group.poll`): mã cuộc bình chọn để mở cửa sổ Xem (GET /api/polls/:pollId) + hành động (create, vote...) */
  poll: { pollId: string; action: string } | null;
  /** Tin nhắc hẹn của nhóm: tên hẹn, biểu tượng, giờ hẹn (ISO), kiểu lặp (null = không lặp); null với tin khác */
  reminder: { title: string; emoji: string | null; startAt: string; repeat: "daily" | "weekly" | "monthly" | "yearly" | null } | null;
  /**
   * Cảm xúc trên tin như Zalo, gộp theo loại; `emoji` null = mã Zalo chưa biết (hiện `icon`). `tapIds`: mã các lần bấm đã
   * đếm - một lần bấm lên chùm ảnh gắn vào mọi món của khung, nên gộp cảm xúc của chùm phải đếm theo mã này, không cộng `count`.
   */
  reactions: Array<{ icon: string; emoji: string | null; count: number; mine: boolean; names: string[]; tapIds: string[] }>;
  attachments: AttachmentInfo[];
};

/** Một đoạn chữ có định dạng: đậm / nghiêng / gạch / màu "#rrggbb" / cỡ chữ (đã lọc ở máy chủ), hoặc chỗ nhắc tên */
export type TextStyleSpan = {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  /** Nhỏ 13px, Lớn 18px, Rất lớn 20px (null = Trung bình) */
  size: "small" | "big" | "xbig" | null;
  /** Chỗ nhắc tên (@Tên, đã đổi sang tên gợi nhớ nếu có): tô xanh như Zalo */
  mention?: boolean;
  /** Dòng bắt đầu ở `start` là mục danh sách: gạch đầu dòng / đánh số (dấu do giao diện vẽ, không nằm trong chữ) */
  list?: "bullet" | "number";
  /** Dòng bắt đầu ở `start` thụt lề mấy bậc (1-5) */
  indent?: number;
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
export type SearchResult = ArchivedMessage & {
  threadName: string | null;
  threadIsFriend: boolean;
  threadAvatarUrl: string | null;
  /** Nhóm không có ảnh riêng: vài thành viên để ghép avatar như danh sách hội thoại (Zalo PC cũng ghép ở kết quả tìm) */
  threadMemberAvatars: MemberAvatar[];
  threadMemberCount: number | null;
};
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
  threadAvatarUrl: string | null;
  /** Nhóm không có ảnh riêng: vài thành viên để ghép avatar như danh sách hội thoại */
  memberAvatars: MemberAvatar[];
  memberCount: number | null;
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
  /** Tin đã gửi bị thu hồi lúc nào (qua kho hoặc người dùng tự thu hồi trên Zalo) */
  recalledAt: string | null;
  /** Đang chờ daemon thu hồi / Zalo không cho thu hồi */
  recallRequestedAt: string | null;
  recallError: string | null;
  /** Tin chuyển tiếp (hộp Chia sẻ); các mục của cùng một lần chia sẻ chung `batchId` */
  forwarded: boolean;
  /** File gửi kèm (lệnh send_file của Claude): tên + cỡ, không kèm đường dẫn trên máy */
  files: Array<{ name: string; size: number; kind: "image" | "video" | "file" }>;
};

// GET  /api/outbox?status=&limit=100           -> OutboxListResponse (status: một hoặc nhiều, cách bằng dấu phẩy;
//      counts = số mục mỗi trạng thái của CẢ hàng đợi, cho số trên tab)
// POST /api/messages/delete-preview  body MessageDeleteRequest -> MessageDeletePreview (cho hộp xác nhận)
// POST /api/messages/delete          body MessageDeleteRequest -> MessageDeleteResult
//      Xóa tin khỏi KHO (không đụng Zalo), file không tin nào khác dùng thì xóa khỏi ổ; đồng bộ sau không đưa tin vào lại
export type MessageDeleteRequest = { ids: number[] };
export type MessageDeletePreview = { messages: number; files: number; bytes: number };
export type MessageDeleteResult = { deleted: number; filesRemoved: number; bytes: number };

// POST /api/messages/:id/react  body ReactRequest -> ReactResult | 400/504 ApiError
//      Thả cảm xúc như Zalo (6 cảm xúc nhanh); chờ daemon thả xong tối đa vài giây. Cảm xúc hiện khi listener ghi lại
export type ReactRequest = { icon: string };
export type ReactResult = { ok: true };

// POST /api/messages/:id/forward  body ForwardRequestBody -> ForwardResult | 400 ApiError
//      Chuyển tiếp (Chia sẻ) tin chữ / link tới tối đa 100 hội thoại; mỗi nơi một mục hàng đợi (+ lời nhắn nếu có)
export type ForwardRequestBody = { threadIds: string[]; note?: string };
export type ForwardResult = { ids: number[]; batchId: string };

// POST /api/outbox  body SendRequest            -> 200 OutboxItem | 400 ApiError
//      when "now": vào hàng đợi đã duyệt, daemon gửi trong vài giây (web hỏi lại GET /api/outbox/:id)
//      when "schedule": cần sendDate + sendTime (giờ của kho)
//      when "draft": chỉ lưu nháp, chờ bấm Duyệt
//      uploads: file đã tải lên (POST /api/outbox/uploads), gửi theo thứ tự chùm ảnh, file khác, rồi chữ (có thể trống)
//      styles: định dạng chữ theo chữ GỐC (chưa cắt khoảng trắng), đúng mã Zalo, xem src/outbox/outbox-text-styles.ts
// POST /api/outbox/uploads?name=<tên file>  body: dữ liệu thô, Content-Type: application/octet-stream
//      -> OutboxUploadResult | 400 / 413 ApiError. Chỉ lưu file (tối đa 500 MB), chưa gửi gì
// GET  /api/outbox/:id                          -> OutboxItem
// POST /api/outbox/:id/approve  {}              -> OutboxItem (draft -> approved)
// POST /api/outbox/:id/cancel   {}              -> OutboxItem (draft/approved -> cancelled)
// POST /api/outbox/:id/recall   {}              -> OutboxItem (ghi yêu cầu thu hồi tin đã gửi; daemon thu hồi trong vài giây)
export type SendRequest = {
  threadId: string;
  text: string;
  when: "now" | "schedule" | "draft";
  sendDate?: string; // YYYY-MM-DD
  sendTime?: string; // HH:mm
  /** Trả lời tin này (số tin trong kho): tin mới mang ô trích dẫn tin gốc như Zalo */
  replyToMessageId?: number;
  /** `photo` = vào chùm ảnh (nút Gửi hình ảnh), `file` = thẻ file kể cả ảnh / video (nút Đính kèm File); tối đa 10 */
  uploads?: Array<{ id: string; as: "photo" | "file" }>;
  /** Định dạng chữ: mỗi đoạn `{ start, len, st }` như Zalo ("b,c_db342e", "lst_1", "ind_20"...) */
  styles?: Array<{ start: number; len: number; st: string }>;
};
export type OutboxUploadResult = { uploadId: string; name: string; size: number };
export type OutboxListResponse = { items: OutboxItem[]; counts: Record<OutboxStatus, number> };

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
  /** Tra số điện thoại (lookup_phones): tối đa mỗi ngày */
  lookupDailyCap: number;
  /** Tra số: mỗi lượt cách lượt trước ngẫu nhiên trong khoảng này (giây) */
  lookupMinGapSeconds: number;
  lookupMaxGapSeconds: number;
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
  /** Thư mục Zalo PC lưu file (Zalo Received Files) người dùng chọn cho nick này; null = chưa chọn */
  receivedFilesDir: string | null;
  /** Các thư mục Zalo Received Files kho sẽ dò (đã chọn trước, rồi chỗ tự tìm), chỉ những thư mục có trên máy */
  receivedFilesDirs: string[];
};
// POST /api/zalo-pc-media/received-files-dir       { dir: string | null } -> ZaloPcMediaImportStatus | 400 { error }
// POST /api/zalo-pc-media/received-files-dir/pick  {} (mở hộp thoại Windows, chờ chọn / Hủy) -> ZaloPcMediaImportStatus | 409 | 500
