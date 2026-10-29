import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { inTransaction } from "../shared/db-transaction.js";
import { localWallClockToUtc } from "../shared/local-date-range.js";
import { containsUnsafeControlChars } from "../shared/terminal-safe-text.js";
import { findThread, type ThreadSummary } from "../storage/message-read-queries.js";
import { enqueueOutboxItem, type OutboxCreator } from "../storage/outbox-store.js";
import { getSendSettings } from "../storage/send-settings-store.js";

/**
 * Kiểm tra + đưa yêu cầu gửi vào hàng đợi. Dùng CHUNG cho MCP (Claude), dashboard
 * và CLI để mọi đường vào có đúng một bộ luật. Không gọi Zalo: daemon gửi sau.
 */
export const MAX_TEXT_LENGTH = 2000;
const MAX_SCHEDULE_DAYS_AHEAD = 60;
const UNSAFE_CHARS_ERROR = "Nội dung/ghi chú chứa ký tự điều khiển (CR, ESC, đảo chiều chữ...) - không được phép.";

export type SendWhen = "now" | "schedule" | "draft";
export type EnqueueContext = { db: DatabaseSync; env: AppEnv; now?: () => Date };
export type EnqueueResult =
  | { ok: true; ids: number[]; batchId: string | null; notBefore: string | null; warnings: string[] }
  | { ok: false; error: string };

type Common = { when: SendWhen; sendDate?: string; sendTime?: string; note?: string; createdBy: OutboxCreator };

function checkText(rawText: string): string | { error: string } {
  const text = rawText.trim();
  if (!text) return { error: "Nội dung tin trống." };
  if (text.length > MAX_TEXT_LENGTH) return { error: `Nội dung dài ${text.length} ký tự, tối đa ${MAX_TEXT_LENGTH}.` };
  if (containsUnsafeControlChars(text)) return { error: UNSAFE_CHARS_ERROR };
  return text;
}

function checkThread(db: DatabaseSync, threadId: string): ThreadSummary | { error: string } {
  return (
    findThread(db, threadId) ?? {
      error: `Không thấy thread_id=${threadId} trong kho. Chỉ gửi được tới hội thoại đã có; tìm bằng list_threads.`,
    }
  );
}

function resolveSchedule(ctx: EnqueueContext, c: Common): { notBefore: string | null } | { error: string } {
  if (c.when !== "schedule") return { notBefore: null };
  if (!c.sendDate || !c.sendTime) return { error: "Hẹn giờ cần đủ ngày (YYYY-MM-DD) và giờ (HH:mm)." };
  const iso = localWallClockToUtc(c.sendDate, c.sendTime, ctx.env.ARCHIVE_TIMEZONE);
  if (!iso) return { error: `Ngày/giờ hẹn không hợp lệ: ${c.sendDate} ${c.sendTime}.` };
  const now = (ctx.now ?? (() => new Date()))().getTime();
  const at = Date.parse(iso);
  if (at <= now) return { error: `Giờ hẹn ${c.sendDate} ${c.sendTime} đã qua.` };
  if (at - now > MAX_SCHEDULE_DAYS_AHEAD * 86_400_000) return { error: `Chỉ hẹn tối đa ${MAX_SCHEDULE_DAYS_AHEAD} ngày tới.` };
  return { notBefore: iso };
}

function isDuplicatePending(db: DatabaseSync, threadId: string, text: string): number | null {
  const row = db
    .prepare("SELECT id FROM outbox WHERE thread_id = ? AND text = ? AND status IN ('draft', 'approved', 'sending') LIMIT 1")
    .get(threadId, text) as { id: number } | undefined;
  return row?.id ?? null;
}

/** Một tin tới một hội thoại (tin lẻ: không trần, không khung giờ) */
export function enqueueSingle(ctx: EnqueueContext, req: Common & { threadId: string; text: string }): EnqueueResult {
  if (req.note && containsUnsafeControlChars(req.note)) return { ok: false, error: UNSAFE_CHARS_ERROR };
  const text = checkText(req.text);
  if (typeof text !== "string") return { ok: false, ...text };
  const thread = checkThread(ctx.db, req.threadId);
  if ("error" in thread) return { ok: false, ...thread };
  const schedule = resolveSchedule(ctx, req);
  if ("error" in schedule) return { ok: false, ...schedule };
  const dup = isDuplicatePending(ctx.db, thread.threadId, text);
  if (dup) return { ok: false, error: `Tin y hệt cho người này đang chờ gửi (#${dup}).` };

  const id = enqueueOutboxItem(ctx.db, {
    threadId: thread.threadId,
    threadType: thread.threadType,
    text,
    mode: "single",
    notBefore: schedule.notBefore,
    batchId: null,
    createdBy: req.createdBy,
    note: req.note?.slice(0, 500) ?? null,
    status: req.when === "draft" ? "draft" : "approved",
  });
  return { ok: true, ids: [id], batchId: null, notBefore: schedule.notBefore, warnings: [] };
}

/**
 * Lô gửi nhiều người: mỗi người MỘT nội dung riêng, CHỈ bạn bè (không nhóm),
 * tất cả hoặc không có gì. Daemon gửi từng tin theo nhịp + khung giờ của lô.
 */
export function enqueueBatch(
  ctx: EnqueueContext,
  req: Common & { items: Array<{ threadId: string; text: string }> },
): EnqueueResult {
  const settings = getSendSettings(ctx.db, ctx.env);
  if (req.items.length === 0) return { ok: false, error: "Danh sách người nhận trống." };
  if (req.items.length > settings.batchMaxItems) return { ok: false, error: `Tối đa ${settings.batchMaxItems} người mỗi lô.` };
  if (new Set(req.items.map((i) => i.threadId)).size !== req.items.length) {
    return { ok: false, error: "Mỗi người nhận chỉ xuất hiện một lần trong lô." };
  }
  if (req.items.length > 1 && new Set(req.items.map((i) => i.text.trim())).size !== req.items.length) {
    return { ok: false, error: "Mỗi người phải có nội dung RIÊNG (không gửi một nội dung y hệt cho nhiều người)." };
  }
  if (req.note && containsUnsafeControlChars(req.note)) return { ok: false, error: UNSAFE_CHARS_ERROR };
  const schedule = resolveSchedule(ctx, req);
  if ("error" in schedule) return { ok: false, ...schedule };

  const checked: Array<{ thread: ThreadSummary; text: string }> = [];
  for (const item of req.items) {
    const text = checkText(item.text);
    const thread = checkThread(ctx.db, item.threadId);
    const problem =
      typeof text !== "string"
        ? text.error
        : "error" in thread
          ? thread.error
          : thread.threadType === "group"
            ? "là nhóm - lô chỉ gửi tới bạn bè (gửi vào nhóm thì dùng tin lẻ)"
            : !thread.isFriend
              ? "không phải bạn bè - lô chỉ gửi tới bạn bè"
              : null;
    if (problem) return { ok: false, error: `thread_id=${item.threadId}: ${problem} Không tạo tin nào.` };
    checked.push({ thread: thread as ThreadSummary, text: text as string });
  }

  const batchId = randomUUID();
  const ids = inTransaction(ctx.db, () =>
    checked.map(({ thread, text }) =>
      enqueueOutboxItem(ctx.db, {
        threadId: thread.threadId,
        threadType: thread.threadType,
        text,
        mode: "batch",
        notBefore: schedule.notBefore,
        batchId,
        createdBy: req.createdBy,
        note: req.note?.slice(0, 500) ?? null,
        status: req.when === "draft" ? "draft" : "approved",
      }),
    ),
  );
  const warnings =
    req.when === "schedule" && req.sendTime && outsideWindow(req.sendTime, settings.batchWindowStartHour, settings.batchWindowEndHour)
      ? [`giờ hẹn ${req.sendTime} ngoài khung gửi lô ${settings.batchWindowStartHour}h-${settings.batchWindowEndHour}h, lô sẽ đợi khung mở`]
      : [];
  return { ok: true, ids, batchId, notBefore: schedule.notBefore, warnings };
}

function outsideWindow(time: string, start: number, end: number): boolean {
  const hour = Number(time.slice(0, 2));
  return hour < start || hour >= end;
}
