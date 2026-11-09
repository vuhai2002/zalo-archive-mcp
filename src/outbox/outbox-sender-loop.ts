import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { ThreadKind } from "../archive/archived-message-types.js";
import type { AppEnv } from "../config/env-schema.js";
import {
  claimForSending,
  deferApprovedItem,
  markSendFailed,
  markSent,
  peekNextDue,
  revertSendingToApproved,
  type OutboxItem,
  type OutboxMention,
  type OutboxReplyQuote,
} from "../storage/outbox-store.js";
import { setKillSwitch } from "../storage/send-control-store.js";
import { getSendSettings } from "../storage/send-settings-store.js";
import { blockReasonBeforeSend, gatherSendPolicyInput } from "./gather-send-policy-input.js";
import { evaluateSendPolicy, randomGapMs } from "./send-policy.js";

/** Gửi một tin chữ; `mentions` = nhắc tên (@) trong tin vào nhóm (rỗng = tin chữ thường); `replyTo` = tin gốc được trả lời */
export type SendTextFn = (
  threadId: string,
  threadType: ThreadKind,
  text: string,
  mentions: OutboxMention[],
  replyTo: OutboxReplyQuote | null,
) => Promise<{ msgId: string | null }>;
export type TypingFn = (threadId: string, threadType: ThreadKind) => Promise<void>;

export type OutboxSenderDeps = {
  db: DatabaseSync;
  env: AppEnv;
  log: Logger;
  sendText: SendTextFn;
  sendTyping?: TypingFn;
  /** Không gửi khi listener đang rớt: không thấy được tin dội về, và trạng thái phiên chưa rõ */
  isListenerConnected: () => boolean;
  /** Nick ở chế độ Chỉ đọc: không gọi Zalo gì cả (không gửi, không "đang soạn"), tin để nguyên trong hàng */
  isReadOnly: () => boolean;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

/** Hàng đợi trống thì 2 giây kiểm một lần: tin "gửi ngay" phải đi trong vài giây */
const IDLE_CHECK_MS = 2_000;
const LISTENER_DOWN_CHECK_MS = 10_000;
const READ_ONLY_CHECK_MS = 10_000;
/** Chờ dài nhất giữa hai lần kiểm, để tin mới / mở khóa có hiệu lực sớm */
const MAX_WAIT_MS = 30_000;
const BATCH_MIN_LATENESS_HOURS = 48;
/** zca-js không đặt timeout cho request; "đang soạn" treo thì bỏ qua, không treo vòng gửi */
const TYPING_TIMEOUT_MS = 10_000;

/**
 * Vòng gửi của daemon - nơi DUY NHẤT gọi Zalo để gửi. Nick Chỉ đọc thì không đụng gì. Mỗi lượt lấy MỘT tin đã
 * duyệt tới hạn, kiểm cổng, gửi. Cài đặt đọc lại mỗi lượt (sửa trên dashboard là ăn ngay).
 * Lỗi gửi đầu tiên bật kill switch - nick chính không được thử lại mù quáng.
 * Không bao giờ gửi lại một tin đã gọi Zalo (kể cả khi hỏng): gửi hai lần trên
 * nick chính tệ hơn thiếu một tin.
 */
export class OutboxSender {
  /** Nhịp đã bốc cho tin LÔ kế tiếp */
  private batchGapMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly d: OutboxSenderDeps) {
    this.batchGapMs = this.newBatchGap();
  }

  private now(): Date {
    return (this.d.now ?? (() => new Date()))();
  }

  private newBatchGap(): number {
    const s = getSendSettings(this.d.db, this.d.env);
    return randomGapMs(s.batchMinGapSeconds, s.batchMaxGapSeconds, this.d.random);
  }

  /** Một lượt. Trả số ms nên chờ trước lượt sau. */
  async tick(): Promise<number> {
    const { db, env, log } = this.d;
    const now = this.now();
    const item = peekNextDue(db, now.toISOString());
    if (!item) return IDLE_CHECK_MS;
    if (this.d.isReadOnly()) return READ_ONLY_CHECK_MS;
    if (!this.d.isListenerConnected()) return LISTENER_DOWN_CHECK_MS;
    const settings = getSendSettings(db, env);

    // Tin đã duyệt mà nằm chờ quá lâu (khóa nhiều ngày, mới bật cổng gửi...) thì
    // không còn đúng ngữ cảnh lúc soạn - bỏ, người dùng soạn lại nếu vẫn cần.
    // Tin lô hợp lệ vẫn có thể phải chờ qua đêm (khung giờ, trần ngày) nên hạn tối thiểu 48 giờ;
    // lô bị treo lâu hơn (vd trần = 0 nhiều ngày) thì cũng bỏ, không gửi lô cũ khi mở lại.
    const maxLateHours = item.mode === "batch" ? Math.max(settings.maxLatenessHours, BATCH_MIN_LATENESS_HOURS) : settings.maxLatenessHours;
    const dueAt = new Date(item.notBefore ?? item.approvedAt ?? item.createdAt).getTime();
    if (now.getTime() - dueAt > maxLateHours * 3_600_000) {
      markSendFailed(db, item.id, `Quá hạn: chờ hơn ${maxLateHours} giờ so với giờ dự kiến, không gửi nữa.`);
      log.warn({ id: item.id }, "Bỏ tin quá hạn");
      return 0;
    }

    const decision = evaluateSendPolicy(gatherSendPolicyInput(db, env, settings, item, now, this.batchGapMs));
    if (decision.action === "reject") {
      markSendFailed(db, item.id, decision.reason);
      log.warn({ id: item.id, reason: decision.reason }, "Tin bị cổng gửi từ chối");
      return 0;
    }
    if (decision.action === "wait") {
      if (decision.scope === "item") {
        deferApprovedItem(db, item.id, decision.retryAt);
        return 0;
      }
      log.debug({ id: item.id, reason: decision.reason, retryAt: decision.retryAt }, "Chưa gửi");
      return Math.min(MAX_WAIT_MS, Math.max(1_000, new Date(decision.retryAt).getTime() - now.getTime()));
    }

    if (!claimForSending(db, item.id, now.toISOString())) return 0;
    await this.typeLikeAHuman(item);

    const blocked = this.d.isReadOnly()
      ? "nick vừa chuyển sang Chỉ đọc"
      : blockReasonBeforeSend(db, env, settings, item, this.now(), this.d.isListenerConnected());
    if (blocked) {
      revertSendingToApproved(db, item.id);
      log.warn({ id: item.id, reason: blocked }, "Dừng ngay trước khi gửi - trả tin về hàng đợi");
      return 1_000;
    }
    if (item.mode === "batch") this.batchGapMs = this.newBatchGap();
    await this.sendClaimed(item);
    return 0;
  }

  private async sendClaimed(item: OutboxItem): Promise<void> {
    const { db, log } = this.d;
    try {
      const result = await this.d.sendText(item.threadId, item.threadType, item.text, item.mentions, item.replyTo);
      if (!result.msgId) throw new Error("Zalo không trả msgId - không rõ tin đã tới chưa");
      markSent(db, item.id, result.msgId);
      log.info({ id: item.id, threadId: item.threadId, msgId: result.msgId }, "Đã gửi tin trong hàng đợi");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markSendFailed(db, item.id, message);
      setKillSwitch(db, true, `Lỗi khi gửi #${item.id}: ${message}`);
      log.error({ id: item.id, err }, "Gửi hỏng - đã BẬT kill switch, cần người dùng kiểm tra rồi mở lại");
    }
  }

  /** Báo "đang soạn" rồi chờ một lúc theo độ dài tin, như người gõ thật. Hỏng/treo thì bỏ qua. */
  private async typeLikeAHuman(item: OutboxItem): Promise<void> {
    if (!this.d.sendTyping) return;
    const sleep = this.d.sleep ?? ((t: number) => new Promise<void>((r) => setTimeout(r, t)));
    try {
      await Promise.race([
        this.d.sendTyping(item.threadId, item.threadType),
        sleep(TYPING_TIMEOUT_MS).then(() => {
          throw new Error("typing timeout");
        }),
      ]);
    } catch {
      return;
    }
    // Tin lẻ người dùng đang chờ thì gõ ngắn; tin lô thì như người gõ thật
    const cap = item.mode === "single" ? 3_000 : 8_000;
    await sleep(Math.min(cap, 1_000 + item.text.length * 50));
  }

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      let delay = IDLE_CHECK_MS;
      try {
        delay = await this.tick();
      } catch (err) {
        this.d.log.error({ err }, "Vòng gửi gặp lỗi");
      }
      if (!this.stopped) this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, 1_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
