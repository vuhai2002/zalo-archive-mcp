/**
 * Kế hoạch nối lại listener. Thuần (không đụng đồng hồ/mạng) để test tất định.
 * Lấy từ zalo-agent (`reconnect-planner.ts`), đã chạy production.
 *
 * Bài học gốc (zalo-agent): đổi mật khẩu Zalo thu hồi mọi phiên;
 * listener nối được rồi bị từ chối sau vài ms, nối lại bằng cookie chết, LẶP VÔ
 * TẬN mỗi ~2 giây. Nên:
 * 1. Chỉ reset backoff khi kết nối ĐỨNG đủ lâu. Nối chớp-tắt tính là thất bại.
 * 2. Đếm chớp-tắt liên tiếp; tới ngưỡng thì DỪNG HẲN (kho khác bot: nick chính
 *    giằng co với Zalo là rủi ro, thà thủng một đoạn rồi người dùng đăng nhập lại).
 * 3. Bị đá vì có phiên Zalo Web khác (3000): chờ lâu chứ không nối ngay, kẻo đá
 *    ngược lại phiên người dùng vừa mở. Riêng lần 3000 ĐẦU TIÊN kể từ lần kết nối đứng gần nhất thì
 *    thử lại sớm (`duplicateFirstRetryMs`): Zalo cũng trả 3000 ("NOT_AUTHENTICATED") khi vừa mở máy,
 *    Zalo PC khởi động cùng lúc - chờ 15 phút cho trường hợp đó là phí. Bị lại mới chờ lâu.
 */
export const DUPLICATE_CONNECTION_CODE = 3000;

export type ReconnectPlannerOptions = {
  baseDelayMs: number;
  maxDelayMs: number;
  duplicateWaitMs: number;
  /** Lần 3000 đầu tiên kể từ lần kết nối đứng gần nhất: thử lại sau chừng này (mặc định = duplicateWaitMs) */
  duplicateFirstRetryMs?: number;
  giveUpAfterFlaps: number;
  /** Nối ngắn hơn mốc này coi là chớp-tắt */
  stableAfterMs?: number;
};

export type ReconnectDecision =
  | { action: "reconnect"; delayMs: number; reason: "backoff" | "duplicate_session"; flaps: number }
  | { action: "give_up"; flaps: number };

const DEFAULT_STABLE_AFTER_MS = 30_000;

export class ReconnectPlanner {
  private failures = 0;
  private flaps = 0;
  private duplicateCloses = 0;
  private connectedAt: number | null = null;

  constructor(private readonly opts: ReconnectPlannerOptions) {}

  markConnected(now: number): void {
    this.connectedAt = now;
  }

  /**
   * Gọi khi listener đóng (hoặc start() ném). `jitterMs` >= 0 do caller cấp.
   *
   * `networkOutage`: lần thử này CHƯA HỀ mở được kết nối và lỗi là lỗi mạng
   * (DNS, TCP...). Mất mạng không nói gì về phiên Zalo, nên không tính là
   * chớp-tắt - cứ thử lại theo backoff tới trần, không bao giờ bỏ cuộc vì nó.
   */
  markClosed(now: number, code: number, jitterMs: number, networkOutage = false): ReconnectDecision {
    const stable =
      this.connectedAt !== null && now - this.connectedAt >= (this.opts.stableAfterMs ?? DEFAULT_STABLE_AFTER_MS);
    if (stable) {
      this.failures = 0;
      this.flaps = 0;
      this.duplicateCloses = 0;
    } else if (!(networkOutage && this.connectedAt === null)) {
      this.flaps++;
    }
    // Tiêu mốc kết nối: lần đóng kế tiếp không có kết nối mới xen giữa thì không tính là "đứng"
    this.connectedAt = null;

    if (this.flaps >= this.opts.giveUpAfterFlaps) return { action: "give_up", flaps: this.flaps };

    if (code === DUPLICATE_CONNECTION_CODE) {
      const first = this.duplicateCloses++ === 0;
      const wait = first ? (this.opts.duplicateFirstRetryMs ?? this.opts.duplicateWaitMs) : this.opts.duplicateWaitMs;
      return { action: "reconnect", delayMs: wait + jitterMs, reason: "duplicate_session", flaps: this.flaps };
    }
    const backoff = Math.min(this.opts.maxDelayMs, this.opts.baseDelayMs * 2 ** this.failures);
    this.failures++;
    return { action: "reconnect", delayMs: backoff + jitterMs, reason: "backoff", flaps: this.flaps };
  }
}
