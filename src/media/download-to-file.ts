import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { isAllowedMediaHost } from "./media-file-naming.js";
import { removePathSync } from "../shared/remove-path-sync.js";

export type DownloadOutcome =
  | { ok: true; tempFile: string; sha256: string; sizeBytes: number; mime: string | null }
  | {
      ok: false;
      permanent: boolean;
      status: "failed" | "too_large" | "blocked_host";
      error: string;
      /** Link hết hạn / CDN không còn giữ ở link này: xin Zalo cấp lại link mới có thể cứu */
      expired?: boolean;
    };

export type DownloadOptions = {
  url: string;
  tempDir: string;
  maxBytes: number;
  allowedHostSuffixes: readonly string[];
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

const MAX_REDIRECTS = 3;
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  referer: "https://chat.zalo.me/",
};

/**
 * Tải một URL media về file tạm, vừa tải vừa băm sha256 và đếm byte.
 *
 * Tự đi theo redirect (tối đa 3) và kiểm host ở MỖI bước: URL ban đầu là CDN
 * Zalo không có nghĩa bước redirect cũng vậy. Không gửi cookie tài khoản.
 */
export async function downloadToTempFile(opts: DownloadOptions): Promise<DownloadOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  let url = opts.url;
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedMediaHost(url, opts.allowedHostSuffixes)) {
      return { ok: false, permanent: true, status: "blocked_host", error: `Host không thuộc CDN Zalo được phép: ${safeHost(url)}` };
    }
    try {
      response = await doFetch(url, { redirect: "manual", headers: BROWSER_HEADERS, signal: AbortSignal.timeout(opts.timeoutMs) });
    } catch (err) {
      return { ok: false, permanent: false, status: "failed", error: `Lỗi mạng: ${err instanceof Error ? err.message : String(err)}` };
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      void response.body?.cancel();
      try {
        url = new URL(location, url).toString();
      } catch {
        return { ok: false, permanent: true, status: "failed", error: "Chuyển hướng tới URL hỏng" };
      }
      continue;
    }
    break;
  }

  if (!response || (response.status >= 300 && response.status < 400)) {
    void response?.body?.cancel();
    return { ok: false, permanent: true, status: "failed", error: "Quá nhiều lần chuyển hướng" };
  }
  if (!response.ok) {
    void response.body?.cancel();
    // 403/404/410: URL hết hạn hoặc CDN đã xóa file - tải lại link cũ vô ích, chỉ xin link mới mới cứu được
    const expired = response.status === 404 || response.status === 410 || response.status === 403;
    return { ok: false, permanent: expired, expired, status: "failed", error: `HTTP ${response.status}` };
  }
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > opts.maxBytes) {
    void response.body?.cancel();
    return { ok: false, permanent: true, status: "too_large", error: `File ${declared} byte vượt trần ${opts.maxBytes}` };
  }
  if (!response.body) return { ok: false, permanent: false, status: "failed", error: "Phản hồi rỗng" };
  let peeked: Awaited<ReturnType<typeof peekSmallTextBody>>;
  try {
    peeked = await peekSmallTextBody(response, declared);
  } catch (err) {
    return { ok: false, permanent: false, status: "failed", error: `Đứt khi tải: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (peeked?.expiredNote) {
    return { ok: false, permanent: true, expired: true, status: "failed", error: `Link hết hạn (CDN trả: ${peeked.expiredNote})` };
  }
  // Đã đọc hết thân phản hồi nhỏ để soi: lưu từ phần đã đọc
  const source = peeked ? new Blob([peeked.bytes]).stream() : response.body;

  const tempFile = path.join(opts.tempDir, `${crypto.randomUUID()}.part`);
  const hash = crypto.createHash("sha256");
  let size = 0;
  // Đếm byte + băm ngay trên luồng; vượt trần thì ngắt luồng
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.byteLength;
      if (size > opts.maxBytes) return done(new TooLargeError());
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    fs.mkdirSync(opts.tempDir, { recursive: true });
    // pipeline gom MỌI lỗi (mạng, đĩa đầy, file bị khóa) vào một promise - không lỗi nào
    // rơi ra thành uncaughtException làm chết cả daemon
    await pipeline(
      Readable.fromWeb(source as unknown as NodeReadableStream<Uint8Array>),
      meter,
      fs.createWriteStream(tempFile, { mode: 0o600 }),
    );
  } catch (err) {
    removePathSync(tempFile, { force: true });
    if (err instanceof TooLargeError) {
      return { ok: false, permanent: true, status: "too_large", error: `File vượt trần ${opts.maxBytes} byte` };
    }
    return { ok: false, permanent: false, status: "failed", error: `Đứt khi tải: ${err instanceof Error ? err.message : String(err)}` };
  }
  // CDN Zalo trả 200 mà rỗng khi tải ngay lúc ảnh vừa gửi (file chưa lên CDN): chưa có gì, lát thử lại
  if (size === 0) {
    removePathSync(tempFile, { force: true });
    return { ok: false, permanent: false, status: "failed", error: "Phản hồi rỗng (0 byte) - CDN chưa có file, sẽ thử lại" };
  }
  return { ok: true, tempFile, sha256: hash.digest("hex"), sizeBytes: size, mime: response.headers.get("content-type") };
}

class TooLargeError extends Error {}

const ERROR_BODY_MAX_BYTES = 2048;

/**
 * CDN có lúc trả 200 kèm một mẩu JSON / chữ báo chữ ký hết hạn thay vì file. Chỉ soi phản hồi
 * nhỏ, kiểu JSON / text, không đánh dấu là file tải về (null = không soi). `expiredNote` là mẩu
 * lỗi ngắn nếu đó là trang báo hết hạn; không phải thì `bytes` là nội dung file đã đọc.
 */
async function peekSmallTextBody(response: Response, declared: number): Promise<{ bytes: Uint8Array; expiredNote: string | null } | null> {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const looksLikeText = type.includes("json") || type.startsWith("text/");
  if (!looksLikeText || response.headers.has("content-disposition") || !(declared > 0 && declared <= ERROR_BODY_MAX_BYTES)) {
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const expired = /expired|invalid signature|signature.*(invalid|expire)/i.test(text);
  return { bytes, expiredNote: expired ? text.replace(/\s+/g, " ").trim().slice(0, 120) : null };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(URL hỏng)";
  }
}
