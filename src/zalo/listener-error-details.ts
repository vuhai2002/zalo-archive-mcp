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
