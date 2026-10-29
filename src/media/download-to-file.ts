import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { isAllowedMediaHost } from "./media-file-naming.js";

export type DownloadOutcome =
  | { ok: true; tempFile: string; sha256: string; sizeBytes: number; mime: string | null }
  | { ok: false; permanent: boolean; status: "failed" | "too_large" | "blocked_host"; error: string };

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
    // 403/404/410: CDN đã xóa file hoặc URL hết hạn - thử lại cũng vô ích (cần renewlink, chưa làm)
    const permanent = response.status === 404 || response.status === 410 || response.status === 403;
    return { ok: false, permanent, status: "failed", error: `HTTP ${response.status}` };
  }
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > opts.maxBytes) {
    void response.body?.cancel();
    return { ok: false, permanent: true, status: "too_large", error: `File ${declared} byte vượt trần ${opts.maxBytes}` };
  }
  if (!response.body) return { ok: false, permanent: false, status: "failed", error: "Phản hồi rỗng" };

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
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      meter,
      fs.createWriteStream(tempFile, { mode: 0o600 }),
    );
  } catch (err) {
    fs.rmSync(tempFile, { force: true });
    if (err instanceof TooLargeError) {
      return { ok: false, permanent: true, status: "too_large", error: `File vượt trần ${opts.maxBytes} byte` };
    }
    return { ok: false, permanent: false, status: "failed", error: `Đứt khi tải: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, tempFile, sha256: hash.digest("hex"), sizeBytes: size, mime: response.headers.get("content-type") };
}

class TooLargeError extends Error {}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(URL hỏng)";
  }
}
