/**
 * Lần nối lại đã hẹn của listener: giờ nối lại + lý do kết nối bị đóng, để dashboard nói rõ "Zalo đóng
 * kết nối (mã 3000) - tự nối lại lúc 08:30" thay vì chỉ "không kết nối", và cho người dùng "Nối lại ngay".
 */
export type ListenerRetryInfo = {
  /** Giờ sẽ tự nối lại (ISO); null khi không có lần nối lại nào đang hẹn */
  retryAt: string | null;
  /** Mã + lý do Zalo đóng kết nối lần gần nhất (null khi chưa đóng lần nào trong phiên này) */
  closeCode: number | null;
  closeReason: string | null;
};

export class ListenerReconnectTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAt: number | null = null;
  private run: (() => void) | null = null;
  private closeCode: number | null = null;
  private closeReason: string | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  noteClosed(code: number, reason: string | null): void {
    this.closeCode = code;
    this.closeReason = reason || null;
  }

  schedule(delayMs: number, run: () => void): void {
    this.clear();
    this.retryAt = this.now() + delayMs;
    this.run = run;
    this.timer = setTimeout(() => this.fire(), delayMs);
  }

  /** Nối lại ngay thay vì chờ tới giờ hẹn. Trả false nếu không có lần nối lại nào đang hẹn. */
  fireNow(): boolean {
    if (!this.timer) return false;
    this.fire();
    return true;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.retryAt = null;
    this.run = null;
  }

  info(): ListenerRetryInfo {
    return {
      retryAt: this.retryAt === null ? null : new Date(this.retryAt).toISOString(),
      closeCode: this.closeCode,
      closeReason: this.closeReason,
    };
  }

  private fire(): void {
    const run = this.run;
    this.clear();
    run?.();
  }
}
