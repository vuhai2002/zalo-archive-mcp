import type { API } from "zca-js";
import type { QrStatus } from "../dashboard/dashboard-api-contract.js";
import type { SessionIo } from "./zalo-session-manager.js";

/** QR hết hạn thì tự tạo mã mới tối đa bấy nhiêu lần rồi dừng (người dùng bấm lại nếu cần) */
const MAX_QR_RETRIES = 3;

export type QrSnapshot = { pending: boolean; imageBase64: string | null; status: QrStatus | null; error: string | null };

/**
 * Một lượt đăng nhập bằng QR trên dashboard. Chưa gắn với nick nào: quét xong mới
 * biết là nick nào (uid), `onLoggedIn` lo phần chọn thư mục nick và chạy phiên.
 *
 * Số thế hệ (`gen`) như ZaloSessionManager: Hủy / đổi nick tăng số này, nên điện
 * thoại có xác nhận SAU khi đã hủy thì kết quả bị bỏ, không đăng nhập ngầm.
 */
export class ZaloQrLoginFlow {
  private gen = 0;
  private pending = false;
  private image: string | null = null;
  private status: QrStatus | null = null;
  private error: string | null = null;
  private abortCurrent: (() => void) | null = null;

  constructor(private readonly startQr: SessionIo["startQrLoginForWeb"]) {}

  snapshot(): QrSnapshot {
    return { pending: this.pending, imageBase64: this.pending ? this.image : null, status: this.pending ? this.status : null, error: this.error };
  }

  /** Bắt đầu tạo QR (không chờ). Lượt cũ còn dở thì hủy trước. */
  start(onLoggedIn: (api: API) => Promise<void>): void {
    this.cancel();
    const my = this.gen;
    let retries = 0;
    this.pending = true;
    this.image = null;
    this.status = "waiting_scan";
    this.error = null;
    const flow = this.startQr((e) => {
      if (my !== this.gen) return;
      if (e.type === "qr") {
        this.image = e.imageBase64;
        this.status = "waiting_scan";
      } else if (e.type === "scanned") {
        this.status = "scanned";
      } else if (e.type === "declined") {
        this.status = "declined";
      } else if (e.type === "expired") {
        this.status = "expired";
        if (++retries <= MAX_QR_RETRIES) e.retry();
        else e.abort();
      }
    });
    this.abortCurrent = flow.abort;
    flow.done
      .then(async (api) => {
        if (my !== this.gen) return;
        this.finish(my, null);
        if (!api) return void (this.error = "Đăng nhập QR không hoàn tất");
        await onLoggedIn(api);
      })
      .catch((err: unknown) => {
        if (my !== this.gen) return;
        const declined = this.status === "declined";
        const expired = this.status === "expired";
        const message = declined
          ? "Bạn đã từ chối đăng nhập trên điện thoại"
          : expired
            ? "Mã QR đã hết hạn - bấm tạo mã mới"
            : `Đăng nhập QR không thành công: ${err instanceof Error ? err.message : String(err)}`;
        this.finish(my, message);
      });
  }

  /** Hủy lượt đang chờ quét (nếu có); xóa lỗi cũ */
  cancel(): void {
    this.gen++;
    this.abortCurrent?.();
    this.abortCurrent = null;
    this.pending = false;
    this.image = null;
    this.status = null;
    this.error = null;
  }

  private finish(my: number, error: string | null): void {
    if (my !== this.gen) return;
    this.abortCurrent = null;
    this.pending = false;
    this.error = error;
  }
}
