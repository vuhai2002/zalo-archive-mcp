import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from "../shared/local-date-range.js";
import { getAttachment } from "../storage/attachment-queue-store.js";
import { findThread, listThreads, readThread, searchMessages } from "../storage/message-read-queries.js";
import { readThreadAfter, readThreadAround } from "../storage/message-window-queries.js";
import { formatLocalTime, formatMessages, formatThread } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

/** Handler THUẦN của các tool đọc: nhận db + env + tham số đã validate, trả ToolResult */
/** `accountId`: thư mục nick đang dùng. Bản chạy thật đọc lại mỗi lần (xem active-account-tool-context.ts) */
export type ReadToolContext = { db: DatabaseSync; env: AppEnv; mediaRoot: string; accountId: string };

export function listThreadsTool(ctx: ReadToolContext, args: { query?: string; limit?: number }): ToolResult {
  const threads = listThreads(ctx.db, { query: args.query, limit: args.limit ?? 30 });
  if (threads.length === 0) {
    return toolOk(args.query ? `Không có hội thoại nào khớp "${args.query}".` : "Kho chưa có hội thoại nào.");
  }
  const body = threads.map((t) => formatThread(t, ctx.env.ARCHIVE_TIMEZONE)).join("\n");
  // Tên hội thoại/nhóm do người khác đặt nên cũng bọc như nội dung tin
  return toolOk(`${threads.length} hội thoại:\n${wrapUntrustedContent(body, "danh sách hội thoại")}`);
}

/**
 * Đọc tin một hội thoại: mặc định trang mới nhất; `before_id` lùi về tin cũ hơn, `after_id` tới tin mới hơn, `around_id` đoạn
 * quanh một tin (vd tin vừa tìm ra, tin được trả lời) - chỉ dùng MỘT trong ba.
 */
export function readThreadTool(
  ctx: ReadToolContext,
  args: { thread_id: string; before_id?: number; after_id?: number; around_id?: number; limit?: number },
): ToolResult {
  const thread = findThread(ctx.db, args.thread_id);
  if (!thread) return toolError(`Không thấy hội thoại thread_id=${args.thread_id} trong kho. Dùng list_threads để lấy đúng id.`);
  if ([args.before_id, args.after_id, args.around_id].filter((x) => x !== undefined).length > 1) {
    return toolError("Chỉ dùng một trong before_id, after_id, around_id mỗi lần.");
  }
  const ref = { threadId: thread.threadId, threadType: thread.threadType, limit: args.limit ?? 50 };
  const messages =
    args.around_id !== undefined
      ? readThreadAround(ctx.db, { ...ref, messageId: args.around_id })
      : args.after_id !== undefined
        ? readThreadAfter(ctx.db, { ...ref, afterId: args.after_id })
        : readThread(ctx.db, { ...ref, beforeId: args.before_id });
  if (messages === null) return toolError(`Tin #${args.around_id} không thuộc hội thoại thread_id=${args.thread_id}.`);
  if (messages.length === 0) return toolOk(args.after_id !== undefined ? "Không còn tin nào mới hơn." : "Không còn tin nào cũ hơn trong hội thoại này.");
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const header = `Hội thoại thread_id=${thread.threadId} (${thread.threadType}), ${messages.length} tin, giờ ${tz}.`;
  // Tên hội thoại do người khác đặt nên nằm TRONG khối bọc, cùng nội dung tin
  const body = `Tên hội thoại: ${thread.name ?? "(chưa rõ tên)"}\n${formatMessages(messages, tz)}`;
  const more = `Tin cũ hơn: before_id=${messages[0]!.id}. Tin mới hơn: after_id=${messages.at(-1)!.id}.`;
  return toolOk([header, wrapUntrustedContent(body, `hội thoại ${args.thread_id}`), more].join("\n"));
}

/** Tìm tin: theo chữ (không dấu), người gửi, chỉ tin có file (tìm theo tên file), hội thoại, khoảng ngày - cần ít nhất một điều kiện */
export function searchMessagesTool(
  ctx: ReadToolContext,
  args: { query?: string; thread_id?: string; sender_id?: string; files_only?: boolean; from_date?: string; to_date?: string; limit?: number },
): ToolResult {
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const fromIso = args.from_date ? startOfLocalDayUtc(args.from_date, tz) : undefined;
  const toIso = args.to_date ? startOfNextLocalDayUtc(args.to_date, tz) : undefined;
  if (fromIso === null || toIso === null) return toolError("from_date/to_date phải dạng YYYY-MM-DD.");
  if (!args.query?.trim() && !args.sender_id && !fromIso && !toIso) {
    return toolError("Cần ít nhất một điều kiện: query, sender_id, hoặc from_date / to_date.");
  }
  const results = searchMessages(ctx.db, {
    query: args.query,
    threadId: args.thread_id,
    senderId: args.sender_id,
    files: args.files_only ? "only" : undefined,
    fromIso,
    toIso,
    limit: args.limit ?? 20,
  });
  if (results.length === 0) return toolOk(`Không tìm thấy tin nào khớp${args.query ? ` "${args.query}"` : ""} (tìm không phân biệt dấu).`);
  const lines = results.map((m) => `(thread_id=${m.threadId})\n${formatMessages([m], tz)}`).join("\n");
  return toolOk(`${results.length} tin khớp, mới nhất trước:\n${wrapUntrustedContent(lines, `tìm "${args.query ?? ""}"`)}`);
}

export function getAttachmentTool(ctx: ReadToolContext, args: { attachment_id: number }): ToolResult {
  const a = getAttachment(ctx.db, args.attachment_id);
  if (!a) return toolError(`Không có đính kèm #${args.attachment_id}.`);
  const lines = [
    `Đính kèm #${a.id}: ${a.kind}${a.file_name ? ` "${a.file_name}"` : ""}, trạng thái ${a.status}.`,
    `Thuộc tin ${messageNumber(ctx, String(a.msg_id))} (thread_id=${a.thread_id}, gửi ${formatLocalTime(String(a.sent_at), ctx.env.ARCHIVE_TIMEZONE)}).`,
  ];
  if (a.status === "done" && a.local_path) {
    lines.push(`File trên máy: ${path.join(ctx.mediaRoot, String(a.local_path))}`);
    lines.push(`Cỡ ${a.size_bytes} byte, loại ${a.mime ?? "không rõ"}, sha256 ${a.sha256}.`);
  } else if (a.last_error) {
    lines.push(`Lỗi gần nhất: ${a.last_error}`);
  }
  // Tên file do người gửi đặt nên bọc như mọi nội dung khác
  return toolOk(wrapUntrustedContent(lines.join("\n"), `đính kèm #${args.attachment_id}`));
}

/** Số tin trong kho (#N, dùng cho reply_to / around_id) theo mã tin Zalo */
function messageNumber(ctx: ReadToolContext, msgId: string): string {
  const row = ctx.db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msgId) as { id: number } | undefined;
  return row ? `#${row.id}` : `mã Zalo ${msgId}`;
}
