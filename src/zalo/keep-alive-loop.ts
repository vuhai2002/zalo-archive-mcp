import type { Logger } from "pino";
import type { API } from "zca-js";
import { persistSessionCredentials } from "./zalo-session-login.js";

/**
 * KHUNG - gọi `keepAlive` định kỳ rồi lưu lại cookie (có thể đã được làm mới),
 * như zalo-personal làm. zca-js có hàm này nhưng tự nó không bao giờ gọi.
 *
 * Chưa đo: keepAlive có thật sự kéo dài phiên / đổi cookie không (research ghi
 * nhận phiên QR có thể im lặng chết sau khoảng 1 tuần, zca-js #153). Mặc định
 * TẮT (ZALO_KEEPALIVE_MINUTES=0); bật trên nick phụ để đo trước.
 */
export function startKeepAliveLoop(opts: {
  api: API;
  minutes: number;
  credentialsFile: string;
  keyHex: string;
  log: Logger;
}): () => void {
  if (opts.minutes <= 0) return () => {};
  const timer = setInterval(async () => {
    try {
      await opts.api.keepAlive();
      persistSessionCredentials(opts.api, opts.credentialsFile, opts.keyHex);
      opts.log.debug("keepAlive xong, đã lưu lại cookie");
    } catch (err) {
      opts.log.warn({ err }, "keepAlive hỏng");
    }
  }, opts.minutes * 60_000);
  return () => clearInterval(timer);
}
