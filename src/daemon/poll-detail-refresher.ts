import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { backfillPollMessages } from "../storage/poll-message-backfill.js";
import { nextPollDue, savePollSnapshot } from "../storage/poll-store.js";

export type FetchPollDetail = (pollId: number) => Promise<unknown>;

/** Gắn vào daemon: chạy vòng lấy chi tiết bình chọn bằng phiên Zalo đang chạy, trả hàm dừng */
export function startPollDetailRefresher(d: { db: DatabaseSync; log: Logger; api: { getPollDetail: (pollId: number) => Promise<unknown> } }): () => void {
  const r = new PollDetailRefresher({ db: d.db, log: d.log.child({ part: "poll" }), fetchDetail: (id) => d.api.getPollDetail(id) });
  r.start();
  return () => r.stop();
}

const INTERVAL_MS = 5_000;

/**
 * Lấy chi tiết bình chọn nhóm (câu hỏi, phương án, số phiếu, người chọn) bằng getPollDetail - lệnh CHỈ ĐỌC, kho không bình
 * chọn. Mỗi nhịp (5 giây) hỏi tối đa MỘT cuộc: cuộc vừa có hoạt động (sau khi lắng 20 giây), mỗi cuộc tối đa một lần mỗi phút
 * (luật chọn ở `nextPollDue`). Lúc bắt đầu: sửa chữ các tin bình chọn cũ + ghi nhận các cuộc cũ để lấy chi tiết một lần.
 */
export class PollDetailRefresher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly d: { db: DatabaseSync; log: Logger; fetchDetail: FetchPollDetail; now?: () => Date }) {}

  start(): void {
    try {
      const r = backfillPollMessages(this.d.db);
      if (r.texts > 0 || r.polls > 0) this.d.log.info(r, "Đã sửa chữ tin bình chọn cũ và ghi nhận các cuộc bình chọn");
    } catch (err) {
      this.d.log.warn({ err }, "Sửa tin bình chọn cũ hỏng - để lần khởi động sau");
    }
    this.timer ??= setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Hỏi một cuộc bình chọn đến lượt (nếu có). Hỏng thì ghi lỗi, giữ chi tiết cũ; thử lại khi có hoạt động mới hoặc sau vài giờ */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = (this.d.now ?? (() => new Date()))();
      const pollId = nextPollDue(this.d.db, now);
      if (!pollId) return;
      try {
        const detail = await this.d.fetchDetail(Number(pollId));
        savePollSnapshot(this.d.db, pollId, { detailJson: JSON.stringify(detail), error: null, fetchedAt: now.toISOString() });
        this.d.log.info({ pollId }, "Đã lấy chi tiết bình chọn");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        savePollSnapshot(this.d.db, pollId, { detailJson: null, error: message.slice(0, 300), fetchedAt: now.toISOString() });
        this.d.log.warn({ pollId, err: message }, "Lấy chi tiết bình chọn hỏng");
      }
    } finally {
      this.running = false;
    }
  }
}
