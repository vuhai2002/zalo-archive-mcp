import { LoginQRCallbackEventType, Zalo, type API, type Credentials } from "zca-js";
import { loadCredentials, saveCredentials } from "./zalo-credential-store.js";

/**
 * Tạo instance zca-js cho KHO:
 * - `selfListen: true`: mặc định `false` bỏ mọi tin do chính mình gửi (từ điện
 *   thoại, Zalo PC) TRƯỚC khi phát sự kiện - kho sẽ chỉ có nửa cuộc trò chuyện.
 * - `checkUpdate: false`: không gọi npm mỗi lần khởi động.
 */
function createZaloInstance(): Zalo {
  return new Zalo({ selfListen: true, checkUpdate: false, logging: false });
}

export async function loginWithStoredCredentials(credentialsFile: string, keyHex: string): Promise<API> {
  const stored = loadCredentials(credentialsFile, keyHex);
  if (!stored) throw new Error('Chưa đăng nhập account này. Chạy "pnpm login" rồi quét QR.');
  return createZaloInstance().login(stored as Credentials);
}

export type QrProgress = "qr_ready" | "scanned" | "expired" | "declined" | "got_info";

/**
 * Đăng nhập bằng QR. Lưu ý: khi truyền callback, zca-js KHÔNG tự ghi file QR -
 * phải tự gọi `actions.saveToFile()` (bài học từ zalo-agent).
 */
export async function loginWithQr(qrImageFile: string, onProgress: (p: QrProgress) => void): Promise<API> {
  return createZaloInstance().loginQR({ qrPath: qrImageFile }, async (event) => {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        await event.actions.saveToFile(qrImageFile);
        onProgress("qr_ready");
        break;
      case LoginQRCallbackEventType.QRCodeScanned:
        onProgress("scanned");
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        onProgress("expired");
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        onProgress("declined");
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        onProgress("got_info");
        break;
    }
  });
}

export type WebQrEvent =
  | { type: "qr"; imageBase64: string }
  | { type: "scanned" }
  | { type: "expired"; retry: () => void; abort: () => void }
  | { type: "declined" };

/**
 * Đăng nhập QR cho dashboard: không ghi file, lấy thẳng ảnh base64 (zca-js đã bỏ
 * tiền tố `data:`). Trả kèm hàm hủy để người dùng bấm hủy / tạo lại mã.
 *
 * Hai bẫy của zca-js `loginQR` khi có callback (đọc `src/apis/loginQR.ts`):
 * - QR hết hạn: KHÔNG tự tạo mã mới - caller gọi `retry`.
 * - Bị từ chối trên điện thoại: hàm `return` mà không resolve/reject - promise
 *   treo mãi. Nên ở đây tự gọi `abort` để promise kết thúc bằng lỗi.
 * Hủy trước khi mã kịp tạo: ghi cờ, mã vừa tạo xong là hủy ngay.
 */
export function startQrLoginForWeb(onEvent: (e: WebQrEvent) => void): { done: Promise<API>; abort: () => void } {
  let abortCurrent: (() => unknown) | null = null;
  let cancelled = false;
  const done = createZaloInstance().loginQR({}, async (event) => {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        abortCurrent = event.actions.abort;
        if (cancelled) return void event.actions.abort();
        onEvent({ type: "qr", imageBase64: (event.data as { image?: string }).image ?? "" });
        break;
      case LoginQRCallbackEventType.QRCodeScanned:
        onEvent({ type: "scanned" });
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        onEvent({ type: "expired", retry: () => void event.actions.retry(), abort: () => void event.actions.abort() });
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        onEvent({ type: "declined" });
        void event.actions.abort();
        break;
    }
  });
  return {
    done,
    abort: () => {
      cancelled = true;
      void abortCurrent?.();
    },
  };
}

/** Lưu cookie/imei/userAgent hiện tại của phiên (mã hóa) cho các lần khởi động sau */
export function persistSessionCredentials(api: API, credentialsFile: string, keyHex: string): void {
  const ctx = api.getContext();
  saveCredentials(credentialsFile, keyHex, {
    cookie: ctx.cookie.toJSON()?.cookies ?? [],
    imei: ctx.imei,
    userAgent: ctx.userAgent,
  });
}
