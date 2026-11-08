import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { OutboxItem } from "../storage/outbox-item-mapping.js";
import { markRecalled, markRecallFailed, nextRecallRequest, sentMessageRecord } from "../storage/outbox-recall-store.js";

/**
 * Thu hồi tin kho đã gửi, CHỈ khi người dùng yêu cầu (người dùng chốt 2026-11-08): lệnh MCP `recall_message` (Claude Code /
 * Claude Desktop hỏi duyệt mỗi lần vì lệnh đánh dấu phá hủy) hoặc nút Thu hồi trên dashboard ghi yêu cầu vào hàng đợi;
 * vòng này trong daemon lấy yêu cầu ra và gọi Zalo bằng phiên đang chạy. Chỉ thu hồi được tin chính kho đã gửi.
 */
export type SentMessageRef = { threadId: string; threadType: "user" | "group"; msgId: string; cliMsgId: string };
export type RecallFn = (m: SentMessageRef) => Promise<void>;

const INTERVAL_MS = 2_000;

/** Lý do không thu hồi được mục này (null = thu hồi được) */
export function recallProblem(db: DatabaseSync, item: OutboxItem): string | null {
  if (item.status !== "sent" || !item.sentMsgId) return "Chỉ thu hồi được tin đã gửi.";
  if (item.recalledAt) return "Tin này đã thu hồi rồi.";
  const record = sentMessageRecord(db, item.sentMsgId);
  if (record?.recalledAt) return "Tin này đã thu hồi rồi.";
  if (!record?.cliMsgId) return "Kho chưa ghi lại tin đã gửi này (thiếu mã tin phía client) - thử lại sau ít giây.";
  return null;
}

export class OutboxRecaller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly d: { db: DatabaseSync; log: Logger; recall: RecallFn; isReadOnly: () => boolean; now?: () => Date }) {}

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Làm một yêu cầu thu hồi (nếu có) */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { db, log } = this.d;
      const item = nextRecallRequest(db);
      if (!item) return;
      if (this.d.isReadOnly()) return void markRecallFailed(db, item.id, "Nick đang ở chế độ Chỉ đọc - không thu hồi.");
      const problem = recallProblem(db, item);
      if (problem) return void markRecallFailed(db, item.id, problem);
      const cliMsgId = sentMessageRecord(db, item.sentMsgId!)!.cliMsgId!;
      try {
        await this.d.recall({ threadId: item.threadId, threadType: item.threadType, msgId: item.sentMsgId!, cliMsgId });
        markRecalled(db, item.id, (this.d.now ?? (() => new Date()))().toISOString());
        log.info({ id: item.id, msgId: item.sentMsgId }, "Đã thu hồi tin theo yêu cầu");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markRecallFailed(db, item.id, `Zalo không cho thu hồi: ${message}`);
        log.warn({ id: item.id, err }, "Thu hồi tin hỏng");
      }
    } finally {
      this.running = false;
    }
  }
}
