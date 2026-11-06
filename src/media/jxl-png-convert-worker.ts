import { parentPort } from "node:worker_threads";
import { convertJxlToPng } from "./zalo-jxl-photo.js";

/**
 * Luồng phụ của `JxlPngWorkerPool`: nhận byte ảnh JXL, trả byte PNG (hoặc lỗi dạng chữ). Mỗi lúc chỉ đổi một
 * ảnh - pool không gửi ảnh mới khi ảnh trước chưa xong. PNG gửi về bằng cách chuyển hẳn bộ nhớ, không chép.
 */
const port = parentPort;
if (!port) throw new Error("jxl-png-convert-worker chỉ chạy trong worker_threads");

port.on("message", (bytes: Uint8Array) => {
  try {
    const png = convertJxlToPng(bytes);
    port.postMessage({ png }, [png.buffer as ArrayBuffer]);
  } catch (err) {
    port.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
});
