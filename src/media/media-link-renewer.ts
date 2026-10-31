import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { randomGapMs } from "../outbox/send-policy.js";
import {
  getAttachmentRenewContext,
  markAttachmentRenewFailed,
  recordAttachmentRenewed,
  queuedRenewalsNewestFirst,
  renewCallsSince,
  requeueExpiredForRenewal,
  rescheduleRenewal,
  scheduleAttachmentRenewal,
} from "../storage/attachment-renewal-store.js";
import type { PendingAttachment } from "../storage/attachment-queue-store.js";
import {
  closeQueuedRenewalsDeletedByZalo,
  DELETED_BY_ZALO_ERROR,
  isDeletedByZalo,
  markAttachmentDeletedByZalo,
} from "../storage/zalo-deleted-media-store.js";
import type { RenewLinkReplyWaiter } from "../zalo/renew-link-control-listener.js";
import type { RenewMediaLinkInput } from "../zalo/zca-renew-media-link-api.js";
import { pickRenewedUrl, readRenewReply, renewableMediaType, renewMsgInfoFromRawJson } from "./media-link-renewal-request.js";
import { allocateRenewSlot, restartRenewSchedule, type RenewPacing } from "./media-link-renew-schedule.js";

export type MediaLinkRenewerOptions = {
  db: DatabaseSync;
  /** Lời gọi renewlink tới Zalo (daemon gắn qua api.custom; test thay bằng bản giả) */
  call: (input: RenewMediaLinkInput) => Promise<unknown>;
  pacing: RenewPacing;
  log: Logger;
  random?: () => number;
  /** Nơi nhận link Zalo hẹn trả sau qua WebSocket; không có thì phản hồi "trả sau" là hỏng */
  replies?: RenewLinkReplyWaiter;
};

/** Zalo Web chờ link trả sau tối đa 30 giây cho mỗi lệnh - kho chờ đúng như vậy */
const ASYNC_REPLY_TIMEOUT_MS = 30_000;

/**
 * Lỗi Zalo trả cho renewlink, kèm MÃ LỖI: Zalo có lúc trả mã lỗi khác 0 mà câu báo lại là "Successful.",
 * chỉ ghi câu báo thì không biết chuyện gì. Ghi "mã lỗi N" cùng dạng với lỗi Zalo trả qua WebSocket, để
 * lần từ chối vì file đã bị xóa (1001) dù về đường nào cũng được nhận ra như nhau.
 */
export function zaloErrorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "number" || (typeof code === "string" && code.trim() !== "") ? `mã lỗi ${code} - ${message}` : message;
}

export type RenewOutcome = { kind: "renewed"; url: string } | { kind: "wait"; at: Date } | { kind: "failed"; error: string };

/**
 * Xin Zalo cấp lại link media hết hạn, TỪNG lệnh một. Lượt của mỗi file đã được cấp khi xếp
 * hàng (giãn nhịp + trần ngày); ở đây giữ thêm khoảng cách tối thiểu giữa hai lệnh thật sự
 * gửi đi, kể cả lệnh do người dùng bấm Thử lại.
 *
 * File mà Zalo đã xóa khỏi máy chủ (suy từ các lần Zalo từ chối file cùng loại mới hơn - xem
 * `zalo-deleted-media-store.ts`) thì đóng luôn, không xếp lượt, không gọi Zalo: lượt xin lại để
 * dành cho file còn cứu được.
 */
export class MediaLinkRenewer {
  private lastCallAt = 0;

  constructor(private readonly o: MediaLinkRenewerOptions) {}

  /** Link vừa hỏng vì hết hạn: xếp hàng xin lại nếu file chưa từng được xin. Trả false nếu đã xin rồi. */
  scheduleAfterExpiry(item: PendingAttachment, error: string, now: Date): boolean {
    if (item.renewedAt) return false;
    if (this.closeIfDeletedByZalo(item.id, now)) return true;
    const slot = allocateRenewSlot(this.o.db, this.o.pacing, now, this.o.random);
    scheduleAttachmentRenewal(this.o.db, item.id, { slotIso: slot.toISOString(), error });
    this.o.log.info({ id: item.id, kind: item.kind, at: slot.toISOString() }, "Link media hết hạn - đã xếp lượt xin lại link");
    return true;
  }

  /**
   * Chạy lúc khởi động: đóng file đang chờ lượt mà Zalo đã xóa, trả lại lượt của chúng, cấp lượt mới cho
   * hàng chờ còn lại theo tin mới nhất trước (giữ trần ngày), rồi xếp các file đã hỏng vì link hết hạn
   * từ trước. Trả số file vừa được xếp thêm.
   */
  requeueExpired(now: Date): number {
    const { db, pacing, random, log } = this.o;
    const closed = closeQueuedRenewalsDeletedByZalo(db, now);
    restartRenewSchedule(db, pacing, now, (since) => renewCallsSince(db, since, DELETED_BY_ZALO_ERROR));
    const queued = queuedRenewalsNewestFirst(db);
    for (const id of queued) rescheduleRenewal(db, id, allocateRenewSlot(db, pacing, now, random).toISOString());
    if (closed > 0 || queued.length > 0) log.info({ closed, queued: queued.length }, "Hàng chờ xin lại link: đóng file Zalo đã xóa, cấp lại lượt cho phần còn lại");
    return requeueExpiredForRenewal(
      db,
      () => allocateRenewSlot(db, pacing, now, random).toISOString(),
      (id) => this.closeIfDeletedByZalo(id, now),
    );
  }

  /** Zalo đã xóa file này: đóng hẳn, không tốn lượt xin lại */
  private closeIfDeletedByZalo(id: number, now: Date): boolean {
    if (!isDeletedByZalo(this.o.db, id, now)) return false;
    markAttachmentDeletedByZalo(this.o.db, id, now);
    this.o.log.debug({ id }, "Zalo đã xóa file cũ - không xin lại link");
    return true;
  }

  async renew(item: PendingAttachment, now: Date): Promise<RenewOutcome> {
    if (this.closeIfDeletedByZalo(item.id, now)) return { kind: "failed", error: DELETED_BY_ZALO_ERROR };
    const sinceLast = now.getTime() - this.lastCallAt;
    if (sinceLast < this.o.pacing.minGapSeconds * 1000) {
      const gap = randomGapMs(this.o.pacing.minGapSeconds, this.o.pacing.maxGapSeconds, this.o.random);
      const at = new Date(this.lastCallAt + gap);
      scheduleAttachmentRenewal(this.o.db, item.id, { slotIso: at.toISOString(), error: "Chờ lượt xin lại link" });
      return { kind: "wait", at };
    }
    this.lastCallAt = now.getTime();

    const fail = (error: string): RenewOutcome => {
      markAttachmentRenewFailed(this.o.db, item.id, error, now.toISOString());
      this.o.log.warn({ id: item.id, kind: item.kind, error }, "Không xin lại được link media");
      return { kind: "failed", error };
    };
    const ctx = getAttachmentRenewContext(this.o.db, item.id);
    if (!ctx) return fail("Không tìm thấy tin gốc của file");
    const mediaType = renewableMediaType(ctx.kind);
    // Gif, voice...: Zalo không cấp lại link cho các loại này - không gọi cho phí lượt
    if (mediaType === null) return fail("Link hết hạn, Zalo không cấp lại link cho loại file này");

    const msgInfo = renewMsgInfoFromRawJson(ctx.kind, ctx.rawJson, ctx.originalUrl ?? ctx.remoteUrl);
    // Link trả sau được ghép theo link gốc đã gửi: đăng ký chờ TRƯỚC khi gọi
    const keys = Object.values(msgInfo).filter((v): v is string => typeof v === "string" && /^https?:\/\//i.test(v));
    const pending = this.o.replies?.expect(keys);
    let response: unknown;
    try {
      response = await this.o.call({ threadId: ctx.threadId, isGroup: ctx.threadType === "group", mediaType, msgInfo });
    } catch (err) {
      pending?.cancel();
      return fail(`Link hết hạn, Zalo không cấp lại link mới (${zaloErrorText(err)})`);
    }
    const reply = readRenewReply(response);
    // Dạng phản hồi chưa có tài liệu: ghi lại một mẩu để chỉnh bộ đọc nếu Zalo đổi
    const snippet = JSON.stringify(response ?? null).slice(0, 500);
    let bag = reply?.kind === "urls" ? reply.bag : null;
    if (reply?.kind === "async") {
      if (!pending) return fail("Link hết hạn, Zalo hẹn trả link sau (kho chưa nghe được kênh trả)");
      this.o.log.info({ id: item.id }, "Zalo hẹn trả link sau qua WebSocket - đang chờ");
      const later = await pending.wait(ASYNC_REPLY_TIMEOUT_MS);
      if (!later) return fail("Link hết hạn, Zalo hẹn trả link sau nhưng không thấy trả");
      if (!later.ok) return fail(`Link hết hạn, Zalo không cấp lại link mới (${later.error})`);
      bag = later.bag;
    } else {
      pending?.cancel();
    }
    const url = bag ? pickRenewedUrl(ctx.kind, bag) : null;
    if (!url) {
      this.o.log.warn({ id: item.id, response: snippet }, "Phản hồi renewlink không có link");
      return fail("Link hết hạn, Zalo không trả link mới");
    }
    recordAttachmentRenewed(this.o.db, item.id, url, now.toISOString());
    this.o.log.info({ id: item.id, kind: item.kind }, "Zalo đã cấp lại link media");
    return { kind: "renewed", url };
  }
}
