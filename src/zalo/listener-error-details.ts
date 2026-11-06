/**
 * Đọc lỗi của listener. Lỗi socket của `ws` là ErrorEvent (không phải Error):
 * lỗi thật nằm ở `.error`, nên `String(err)` chỉ ra "[object Object]". Module thuần.
 */
export function describeListenerError(err: unknown): { message: string; code: string | null } {
  const inner = (err as { error?: unknown } | null)?.error ?? err;
  const message =
    (inner as { message?: unknown } | null)?.message ?? (err as { message?: unknown } | null)?.message ?? String(err);
  const code = (inner as { code?: unknown } | null)?.code;
  return { message: String(message), code: typeof code === "string" ? code : null };
}

/** Lỗi tầng mạng: mất mạng / DNS / TCP - không nói gì về việc phiên Zalo còn sống hay không */
const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EPIPE",
]);

export function isNetworkErrorCode(code: string | null): boolean {
  return code !== null && NETWORK_ERROR_CODES.has(code);
}

/**
 * Lỗi của một lệnh HTTP tới Zalo (vd đăng nhập bằng cookie) là lỗi mạng: `fetch` của Node báo "fetch failed",
 * mã thật (ENOTFOUND...) nằm ở `cause`, có khi chỉ còn trong câu báo (zca-js gói lại thành
 * "fetch failed: getaddrinfo ENOTFOUND wpa.chat.zalo.me"). Lỗi mạng không nói gì về việc cookie còn dùng được.
 */
export function isNetworkFailure(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; cause?: { code?: unknown } } | null;
  for (const code of [e?.code, e?.cause?.code]) if (typeof code === "string" && NETWORK_ERROR_CODES.has(code)) return true;
  const message = String(e?.message ?? err ?? "");
  return /fetch failed/i.test(message) || [...NETWORK_ERROR_CODES].some((code) => message.includes(code));
}
