import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, JxlImage } from "jxl-oxide-wasm";

/**
 * Ảnh JPEG XL của Zalo. Zalo giữ bản gốc của một số ảnh ở dạng JXL (tin ảnh có
 * `params.convertible = "jxl"`), còn bản JPG do CDN đổi ra khi có máy xin. Có lúc
 * khâu đổi đó hỏng: `/jpg/<id>/<hash>.jpg` trả HTTP 500 trong khi
 * `/jxl/<id>/<hash>.jxl` vẫn tải được - app điện thoại đọc được JXL nên vẫn thấy ảnh.
 * (Chiều ngược lại, Zalo gửi link .jxl thì có bản .jpg: xem deplao `zaloImageUrl.ts`.)
 *
 * Trình duyệt (Chrome 152) không hiện được JXL, nên kho đổi sang PNG để xem trên
 * dashboard và cho Claude đọc, đồng thời giữ file .jxl gốc bên cạnh.
 */

/** Link JPG trên CDN ảnh Zalo -> link bản JXL gốc cùng ảnh; link khác trả null */
export function zaloJxlVariantUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!(host === "zdn.vn" || host.endsWith(".zdn.vn"))) return null;
  const m = /^\/jpg\/(.+)\.jpg$/i.exec(u.pathname);
  if (!m) return null;
  u.pathname = `/jxl/${m[1]}.jxl`;
  return u.toString();
}

/** File có phải JPEG XL không: theo mime, hoặc theo chữ ký đầu file (codestream FF 0A / container "JXL ") */
export function looksLikeJxl(mime: string | null, head: Uint8Array): boolean {
  if (mime?.toLowerCase().startsWith("image/jxl")) return true;
  if (head[0] === 0xff && head[1] === 0x0a) return true;
  const sig = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];
  return sig.every((b, i) => head[i] === b);
}

/** Ảnh quá cỡ này thì không giải mã: chặn file độc khai kích thước khổng lồ làm tràn bộ nhớ */
const MAX_PIXELS = 60_000_000;

let wasmReady = false;
function ensureDecoder(): void {
  if (wasmReady) return;
  const wasmFile = fileURLToPath(import.meta.resolve("jxl-oxide-wasm/module.wasm"));
  initSync({ module: fs.readFileSync(wasmFile) });
  wasmReady = true;
}

/** Giải mã JXL rồi mã hóa PNG (màu đổi về sRGB để trình duyệt hiện đúng). Ném lỗi nếu không phải JXL hợp lệ. */
export function convertJxlToPng(bytes: Uint8Array): Uint8Array {
  ensureDecoder();
  const image = new JxlImage();
  try {
    image.forceSrgb = true;
    image.feedBytes(bytes);
    if (!image.tryInit()) throw new Error("File JXL thiếu dữ liệu, không đọc được phần đầu");
    const pixels = (image.width ?? 0) * (image.height ?? 0);
    if (pixels <= 0 || pixels > MAX_PIXELS) throw new Error(`Ảnh JXL kích thước bất thường (${image.width}x${image.height})`);
    // encodeToPng() tự giải phóng kết quả render (gọi free() thêm là lỗi con trỏ rỗng)
    return image.render().encodeToPng();
  } finally {
    image.free();
  }
}
