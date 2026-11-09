import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { getKillSwitch } from "../storage/send-control-store.js";
import { markReactionDone, markReactionFailed, nextReactionRequest, type ReactionRequest } from "../storage/reaction-request-store.js";

/**
 * Thả cảm xúc theo yêu cầu từ dashboard (rê chuột vào tin, bấm Thích hoặc một cảm xúc), như Zalo. Vòng này trong daemon
 * lấy yêu cầu ra và gọi Zalo bằng phiên đang chạy; listener ghi cảm xúc thật vào kho như mọi cảm xúc khác. Khóa khẩn cấp
 * và nick Chỉ đọc chặn luôn. Hỏng thì chỉ đánh lỗi yêu cầu đó (không bật khóa khẩn cấp: thả cảm xúc không phải gửi tin).
 */
/** Sáu cảm xúc nhanh của Zalo (thanh hiện khi rê vào nút Thích): Thích, Tim, Haha, Wow, Khóc, Giận - mã Zalo */
export const QUICK_REACTIONS = ["/-strong", "/-heart", ":>", ":o", ":-((", ":-h"] as const;
export type ReactFn = (r: ReactionRequest) => Promise<void>;

const INTERVAL_MS = 500;

export class ReactionSender {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly d: { db: DatabaseSync; log: Logger; react: ReactFn; isReadOnly: () => boolean; isListenerConnected: () => boolean; now?: () => Date },
  ) {}

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Làm một yêu cầu (nếu có). Listener đang rớt thì để yêu cầu chờ; dashboard hết giờ chờ sẽ tự bỏ */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { db, log } = this.d;
      const req = nextReactionRequest(db);
      if (!req) return;
      if (this.d.isReadOnly()) return void markReactionFailed(db, req.id, "Nick đang ở chế độ Chỉ đọc - không thả cảm xúc.");
      const kill = getKillSwitch(db);
      if (kill.killed) return void markReactionFailed(db, req.id, `Khóa khẩn cấp đang bật (${kill.reason ?? "không rõ lý do"}).`);
      if (!this.d.isListenerConnected()) return;
      try {
        await this.d.react(req);
        markReactionDone(db, req.id, (this.d.now ?? (() => new Date()))().toISOString());
        log.info({ id: req.id, msgId: req.msgId, icon: req.icon }, "Đã thả cảm xúc");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markReactionFailed(db, req.id, `Zalo không nhận: ${message}`);
        log.warn({ id: req.id, err }, "Thả cảm xúc hỏng");
      }
    } finally {
      this.running = false;
    }
  }
}
