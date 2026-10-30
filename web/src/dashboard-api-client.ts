/**
 * Fetch wrapper cho mọi route `/api`: JSON + cookie phiên; 401 thì đẩy về trang
 * đăng nhập. Kiểu dữ liệu import thẳng từ hợp đồng phía server (`import type`
 * bị xóa lúc biên dịch nên không lọt byte nào của src/ vào bundle).
 */
import type {
  AccountsResponse,
  AuthStatusResponse,
  MeResponse,
  MobileSyncResponse,
  MobileSyncStartRequest,
  OutboxItem,
  OutboxListResponse,
  OutboxStatus,
  OverviewResponse,
  SearchFilter,
  SearchResponse,
  SendRequest,
  SendSettings,
  SessionStatus,
  SettingsResponse,
  ThreadListResponse,
  ThreadMessagesResponse,
  ThreadSendersResponse,
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

  session: () => request<SessionStatus>("/api/session"),
  sessionLoginQr: () => post<SessionStatus>("/api/session/login-qr"),
  sessionStart: () => post<SessionStatus>("/api/session/start"),
  sessionStop: () => post<SessionStatus>("/api/session/stop"),
  sessionLogout: () => post<SessionStatus>("/api/session/logout"),
  accounts: () => request<AccountsResponse>("/api/accounts"),
  activateAccount: (id: string) => post<SessionStatus>(`/api/accounts/${enc(id)}/activate`),
  setAccountReadOnly: (id: string, readOnly: boolean) => post<AccountsResponse>(`/api/accounts/${enc(id)}/read-only`, { readOnly }),
  mobileSync: () => request<MobileSyncResponse>("/api/mobile-sync"),
  mobileSyncStart: (body: MobileSyncStartRequest) => post<MobileSyncResponse>("/api/mobile-sync/start", body),
  mobileSyncCancel: () => post<MobileSyncResponse>("/api/mobile-sync/cancel"),
  attachmentRetry: (id: number) => post<{ ok: true }>(`/api/attachments/${id}/retry`),

  overview: (days: number) => request<OverviewResponse>(withQuery("/api/overview", { days })),

  threads: (p: { query?: string; limit: number; offset: number }) =>
    request<ThreadListResponse>(withQuery("/api/threads", p)),
  threadMessages: (threadId: string, p: { beforeId?: number; afterId?: number; aroundId?: number; limit: number }) =>
    request<ThreadMessagesResponse>(withQuery(`/api/threads/${enc(threadId)}/messages`, p)),
  setThreadPinned: (threadId: string, pinned: boolean) => post<{ pinned: boolean }>(`/api/threads/${enc(threadId)}/pin`, { pinned }),
  threadShared: (threadId: string, p: { kind: "visual" | "file"; limit: number; offset: number }) =>
    request<ThreadSharedMediaResponse>(withQuery(`/api/threads/${enc(threadId)}/shared`, p)),
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

  outboxList: (status: OutboxStatus, limit: number) =>
    request<OutboxListResponse>(withQuery("/api/outbox", { status, limit })),
  outboxGet: (id: number) => request<OutboxItem>(`/api/outbox/${id}`),
  outboxCreate: (body: SendRequest) => post<OutboxItem>("/api/outbox", body),
  outboxApprove: (id: number) => post<OutboxItem>(`/api/outbox/${id}/approve`),
  outboxCancel: (id: number) => post<OutboxItem>(`/api/outbox/${id}/cancel`),

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
