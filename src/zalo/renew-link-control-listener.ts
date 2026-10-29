import type { API } from "zca-js";
import type { MediaUrlBag } from "../media/media-link-renewal-request.js";
import { decodeWsEventData } from "./mobile-sync/zca-mobile-sync-apis.js";

/**
 * Link do `renewlink` hẹn trả sau (`{async: true}`) về qua sự kiện điều khiển trên WebSocket:
 * cmd 601, `act = "renew_link"`, `data` là danh sách kết quả. zca-js bỏ qua loại sự kiện này nên
 * kho đọc thẳng khung WS (cùng cách đọc sự kiện đồng bộ điện thoại). Dạng kết quả như Zalo Web
 * đọc: ảnh `{img, normal, hd, thumb, errorCode}`, file / video `{originalUrl, renewUrl, error}`.
 */

const CMD_CONTROL = 601;

export type RenewLinkResult = { key: string; ok: true; bag: MediaUrlBag } | { key: string; ok: false; error: string };

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function toResult(item: Record<string, unknown>): RenewLinkResult | null {
  const img = str(item.img);
  if (img) {
    const code = Number(item.errorCode ?? 0);
    if (code !== 0) return { key: img, ok: false, error: `mã lỗi ${code}` };
    const bag: MediaUrlBag = { normalUrl: str(item.normal), hdUrl: str(item.hd), thumbUrl: str(item.thumb) };
    return bag.normalUrl || bag.hdUrl ? { key: img, ok: true, bag } : null;
  }
  const original = str(item.originalUrl);
  if (!original) return null;
  const code = Number(item.error ?? 0);
  if (code !== 0) return { key: original, ok: false, error: `mã lỗi ${code}` };
  const renewUrl = str(item.renewUrl);
  return renewUrl ? { key: original, ok: true, bag: { normalUrl: renewUrl } } : null;
}

/** Kết quả renew_link trong một khung WS (rỗng nếu khung không phải sự kiện đó) */
export function extractRenewLinkResults(frame: Buffer, cipherKey: string | null | undefined): RenewLinkResult[] {
  if (frame.length < 5 || frame[0] !== 1 || frame.readUInt16LE(1) !== CMD_CONTROL || frame[3] !== 0) return [];
  const text = frame.subarray(4).toString("utf8");
  if (!text.includes('"data"')) return [];
  const decoded = decodeWsEventData(JSON.parse(text), cipherKey) as { data?: { controls?: unknown[] }; controls?: unknown[] } | null;
  const controls = decoded?.data?.controls ?? decoded?.controls ?? [];
  const results: RenewLinkResult[] = [];
  for (const control of controls) {
    const content = (control as { content?: { act?: unknown; data?: unknown } } | null)?.content;
    if (content?.act !== "renew_link") continue;
    let data = content.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        continue;
      }
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      const r = item && typeof item === "object" ? toResult(item as Record<string, unknown>) : null;
      if (r) results.push(r);
    }
  }
  return results;
}

type ListenerLike = {
  on: (event: string, fn: () => void) => void;
  off?: (event: string, fn: () => void) => void;
  ws?: { on: (e: string, fn: (d: unknown) => void) => void; off?: (e: string, fn: (d: unknown) => void) => void } | null;
  cipherKey?: string | null;
};

/** Nghe khung WS của listener zca-js (gắn lại sau mỗi lần nối lại). Trả hàm gỡ. */
export function attachRenewLinkListener(api: API, onResults: (results: RenewLinkResult[]) => void, onError: (err: unknown) => void): () => void {
  const listener = (api as unknown as { listener?: ListenerLike }).listener;
  if (!listener || typeof listener.on !== "function") return () => {};
  let boundWs: ListenerLike["ws"] = null;
  const onFrame = (data: unknown) => {
    // Soi header trước: tin nhắn thường không tốn công giải mã
    if (!Buffer.isBuffer(data) || data.length < 4 || data[0] !== 1 || data.readUInt16LE(1) !== CMD_CONTROL) return;
    try {
      const results = extractRenewLinkResults(data, listener.cipherKey);
      if (results.length > 0) onResults(results);
    } catch (err) {
      onError(err);
    }
  };
  const bind = () => {
    const ws = listener.ws;
    if (!ws || ws === boundWs) return;
    boundWs?.off?.("message", onFrame);
    boundWs = ws;
    ws.on("message", onFrame);
  };
  listener.on("connected", bind);
  bind();
  return () => {
    listener.off?.("connected", bind);
    boundWs?.off?.("message", onFrame);
    boundWs = null;
  };
}

/**
 * Lệnh xin link đang chờ kết quả trả sau, ghép theo link gốc đã gửi (Zalo Web cũng ghép như
 * vậy: ảnh theo `oriUrl`, file theo `url`, video theo `videoUrl`). Đăng ký TRƯỚC khi gọi
 * renewlink, vì sự kiện có thể về trước cả phản hồi HTTP.
 */
export class RenewLinkReplyWaiter {
  private readonly waiting = new Map<string, (r: RenewLinkResult | null) => void>();

  expect(keys: string[]): { wait: (timeoutMs: number) => Promise<RenewLinkResult | null>; cancel: () => void } {
    const unique = [...new Set(keys.filter(Boolean))];
    let settle: (r: RenewLinkResult | null) => void = () => {};
    const promise = new Promise<RenewLinkResult | null>((resolve) => (settle = resolve));
    const done = (r: RenewLinkResult | null) => {
      for (const k of unique) this.waiting.delete(k);
      settle(r);
    };
    for (const k of unique) this.waiting.set(k, done);
    return {
      wait: (timeoutMs) => {
        const t = setTimeout(() => done(null), timeoutMs);
        return promise.finally(() => clearTimeout(t));
      },
      cancel: () => done(null),
    };
  }

  /** Kết quả từ WS; trả số kết quả khớp một lệnh đang chờ */
  deliver(results: RenewLinkResult[]): number {
    let matched = 0;
    for (const r of results) {
      const resolve = this.waiting.get(r.key);
      if (resolve) {
        resolve(r);
        matched++;
      }
    }
    return matched;
  }
}
