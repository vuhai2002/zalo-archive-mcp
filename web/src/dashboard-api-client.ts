/**
 * Fetch wrapper cho mọi route `/api`: JSON + cookie phiên; 401 thì đẩy về trang
 * đăng nhập. Kiểu dữ liệu import thẳng từ hợp đồng phía server (`import type`
 * bị xóa lúc biên dịch nên không lọt byte nào của src/ vào bundle).
 */
import type {
  AccountsResponse,
  AuthStatusResponse,
  ForwardRequestBody,
  ForwardResult,
  AppAbout,
  MeResponse,
  UpdateInfo,
  MessageDeletePreview,
  MessageDeleteResult,
  MobileSyncResponse,
  ZaloLabelsResponse,
  ZaloPcMediaImportStatus,
  MobileSyncStartRequest,
  OutboxItem,
  OutboxListResponse,
  OutboxStatus,
  OutboxUploadResult,
  OverviewResponse,
  ReactResult,
  SearchFilter,
  SearchResponse,
  SendRequest,
  SendSettings,
  SessionStatus,
  SettingsResponse,
  StorageFilesResponse,
  StorageOverviewResponse,
  StorageRemovePreview,
  StorageRemoveRequest,
  StorageRemoveResult,
  StorageTab,
  StorageThreadsResponse,
  PollView,
  ThreadListResponse,
  ThreadMessagesResponse,
  ThreadSendersResponse,
  ThreadLinksResponse,
  ThreadMembersResponse,
  ThreadSharedMediaResponse,
} from "./archive-api-types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Đường dẫn trang đăng nhập kèm `next` để quay lại đúng chỗ sau khi đăng nhập */
export function loginPath(next: string): string {
  return next && next !== "/" && next !== "/login" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    // fetch chỉ ném khi không tới được server (daemon tắt, mất mạng)
    throw new ApiError(0, "Không kết nối được máy chủ");
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    // Ngoài React tree nên không dùng được navigate() - đổi URL trực tiếp
    if (window.location.pathname !== "/login") {
      window.location.assign(loginPath(window.location.pathname + window.location.search));
    }
    throw new ApiError(401, "Chưa đăng nhập");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === "string" ? data.error : `Lỗi ${res.status}`);
  }
  return data as T;
}

/** Route ghi luôn gửi thân JSON (kể cả `{}`): server chặn POST không phải JSON để chống CSRF dạng form */
function post<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Ghép query string, bỏ các tham số rỗng thay vì gửi `?q=&threadId=` */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const enc = encodeURIComponent;

export const api = {
  authStatus: () => request<AuthStatusResponse>("/api/auth/status"),
  setupPassword: (password: string, confirm: string) => post<MeResponse>("/api/auth/setup", { password, confirm }),
  login: (password: string) => post<MeResponse>("/api/auth/login", { password }),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
  me: () => request<MeResponse>("/api/auth/me"),
  version: () => request<UpdateInfo>("/api/version"),
  versionCheck: () => post<UpdateInfo>("/api/version/check"),
  about: () => request<AppAbout>("/api/about"),

  session: () => request<SessionStatus>("/api/session"),
  sessionLoginQr: () => post<SessionStatus>("/api/session/login-qr"),
  sessionStart: () => post<SessionStatus>("/api/session/start"),
  sessionStop: () => post<SessionStatus>("/api/session/stop"),
  sessionReconnect: () => post<SessionStatus>("/api/session/reconnect"),
  sessionLogout: () => post<SessionStatus>("/api/session/logout"),
  accounts: () => request<AccountsResponse>("/api/accounts"),
  activateAccount: (id: string) => post<SessionStatus>(`/api/accounts/${enc(id)}/activate`),
  setAccountReadOnly: (id: string, readOnly: boolean) => post<AccountsResponse>(`/api/accounts/${enc(id)}/read-only`, { readOnly }),
  mobileSync: () => request<MobileSyncResponse>("/api/mobile-sync"),
  mobileSyncStart: (body: MobileSyncStartRequest) => post<MobileSyncResponse>("/api/mobile-sync/start", body),
  mobileSyncCancel: () => post<MobileSyncResponse>("/api/mobile-sync/cancel"),
  mobileSyncDismissSuggestion: () => post<MobileSyncResponse>("/api/mobile-sync/suggestion/dismiss"),
  zaloPcMedia: () => request<ZaloPcMediaImportStatus>("/api/zalo-pc-media"),
  zaloPcMediaStart: () => post<ZaloPcMediaImportStatus>("/api/zalo-pc-media/start"),
  zaloPcReceivedFilesDir: (dir: string | null) => post<ZaloPcMediaImportStatus>("/api/zalo-pc-media/received-files-dir", { dir }),
  zaloPcReceivedFilesDirPick: () => post<ZaloPcMediaImportStatus>("/api/zalo-pc-media/received-files-dir/pick"),
  attachmentRetry: (id: number) => post<{ ok: true }>(`/api/attachments/${id}/retry`),

  overview: (days: number) => request<OverviewResponse>(withQuery("/api/overview", { days })),

  /** `kind`: chỉ nhóm / chỉ bạn bè (tab của hộp Chia sẻ); `ids`: chỉ các hội thoại này, cách nhau dấu phẩy (chế độ trình chiếu) */
  threads: (p: { query?: string; limit: number; offset: number; kind?: "group" | "friend"; ids?: string }) =>
    request<ThreadListResponse>(withQuery("/api/threads", p)),
  /** Thẻ Phân loại của Zalo (chỉ đọc) để chọn nhanh hội thoại cho chế độ trình chiếu */
  zaloLabels: () => request<ZaloLabelsResponse>("/api/labels"),
  threadMessages: (threadId: string, p: { beforeId?: number; afterId?: number; aroundId?: number; limit: number }) =>
    request<ThreadMessagesResponse>(withQuery(`/api/threads/${enc(threadId)}/messages`, p)),
  setThreadPinned: (threadId: string, pinned: boolean) => post<{ pinned: boolean }>(`/api/threads/${enc(threadId)}/pin`, { pinned }),
  threadShared: (threadId: string, p: { kind: "visual" | "file"; limit: number; offset: number }) =>
    request<ThreadSharedMediaResponse>(withQuery(`/api/threads/${enc(threadId)}/shared`, p)),
  threadLinks: (threadId: string, p: { limit: number; offset: number }) =>
    request<ThreadLinksResponse>(withQuery(`/api/threads/${enc(threadId)}/links`, p)),
  threadMembers: (threadId: string, p: { limit: number; offset: number }) =>
    request<ThreadMembersResponse>(withQuery(`/api/threads/${enc(threadId)}/members`, p)),
  search: (p: {
    q?: string;
    threadId?: string;
    senderId?: string;
    fromDate?: string;
    toDate?: string;
    files?: "only" | "exclude";
    filter?: SearchFilter;
    offset?: number;
    limit: number;
  }) => request<SearchResponse>(withQuery("/api/search", p)),
  threadSenders: (threadId: string) => request<ThreadSendersResponse>(`/api/threads/${enc(threadId)}/senders`),

  /** Mảng trạng thái rỗng = mọi trạng thái; kèm số mục mỗi trạng thái của cả hàng đợi */
  outboxList: (statuses: OutboxStatus[], limit: number) =>
    request<OutboxListResponse>(withQuery("/api/outbox", { status: statuses.length > 0 ? statuses.join(",") : undefined, limit })),
  outboxGet: (id: number) => request<OutboxItem>(`/api/outbox/${id}`),
  outboxCreate: (body: SendRequest) => post<OutboxItem>("/api/outbox", body),
  /** Tải một file lên để gửi (dữ liệu thô, không phải JSON - route riêng, xem outbox-upload-route.ts) */
  outboxUpload: (file: File) =>
    request<OutboxUploadResult>(`/api/outbox/uploads?name=${enc(file.name)}`, { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } }),
  outboxApprove: (id: number) => post<OutboxItem>(`/api/outbox/${id}/approve`),
  outboxCancel: (id: number) => post<OutboxItem>(`/api/outbox/${id}/cancel`),
  /** Tin lẻ đang hẹn giờ -> gửi ngay (dời giờ hẹn về bây giờ) */
  outboxSendNow: (id: number) => post<OutboxItem>(`/api/outbox/${id}/send-now`),
  outboxRecall: (id: number) => post<OutboxItem>(`/api/outbox/${id}/recall`),

  /** Xóa tin khỏi KHO (không đụng Zalo): xem trước cho hộp xác nhận, rồi xóa */
  messageDeletePreview: (ids: number[]) => post<MessageDeletePreview>("/api/messages/delete-preview", { ids }),
  messageDelete: (ids: number[]) => post<MessageDeleteResult>("/api/messages/delete", { ids }),
  /** Thả cảm xúc (6 cảm xúc nhanh); trả về khi daemon đã thả xong */
  messageReact: (id: number, icon: string) => post<ReactResult>(`/api/messages/${id}/react`, { icon }),
  /** Chuyển tiếp (Chia sẻ) tin chữ / link tới tối đa 100 hội thoại */
  messageForward: (id: number, body: ForwardRequestBody) => post<ForwardResult>(`/api/messages/${id}/forward`, body),

  /** Quản lý dữ liệu: dung lượng kho (refresh: đo lại ổ ở nền), hội thoại theo dung lượng, lưới file, xóa FILE giữ tin */
  storage: (refresh = false) => request<StorageOverviewResponse>(refresh ? "/api/storage?refresh=1" : "/api/storage"),
  storageThreads: (p: { sort: string; query?: string; limit: number; offset: number }) =>
    request<StorageThreadsResponse>(withQuery("/api/storage/threads", p)),
  storageFiles: (p: { thread?: string; tab: StorageTab; big?: "1"; sort: string; limit: number; offset: number }) =>
    request<StorageFilesResponse>(withQuery("/api/storage/files", p)),
  storageRemovePreview: (body: StorageRemoveRequest) => post<StorageRemovePreview>("/api/storage/remove-preview", body),
  storageRemove: (body: StorageRemoveRequest) => post<StorageRemoveResult>("/api/storage/remove", body),
  storageDeleteBackups: (names: string[]) => post<StorageOverviewResponse>("/api/storage/backups/delete", { names }),
  /** Chi tiết một cuộc bình chọn (chỉ xem) - daemon lấy từ Zalo sau mỗi đợt hoạt động */
  poll: (pollId: string) => request<PollView>(`/api/polls/${encodeURIComponent(pollId)}`),

  settings: () => request<SettingsResponse>("/api/settings"),
  updateSettings: (patch: Partial<SendSettings>) =>
    request<SettingsResponse>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  setKillSwitch: (killed: boolean, reason?: string) =>
    post<SettingsResponse>("/api/kill-switch", reason ? { killed, reason } : { killed }),
};

/** Câu lỗi hiển thị được cho mọi thứ `catch` bắt về */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : "Lỗi không xác định";
}
