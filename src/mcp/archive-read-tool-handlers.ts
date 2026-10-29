import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from "../shared/local-date-range.js";
import { getAttachment } from "../storage/attachment-queue-store.js";
import { findThread, listThreads, readThread, searchMessages } from "../storage/message-read-queries.js";
import { formatLocalTime, formatMessages, formatThread } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

/** Handler THUẦN của các tool đọc: nhận db + env + tham số đã validate, trả ToolResult */
export type ReadToolContext = { db: DatabaseSync; env: AppEnv; mediaRoot: string };

export function listThreadsTool(ctx: ReadToolContext, args: { query?: string; limit?: number }): ToolResult {
  const threads = listThreads(ctx.db, { query: args.query, limit: args.limit ?? 30 });
  if (threads.length === 0) {
    return toolOk(args.query ? `Không có hội thoại nào khớp "${args.query}".` : "Kho chưa có hội thoại nào.");
  }
  const body = threads.map((t) => formatThread(t, ctx.env.ARCHIVE_TIMEZONE)).join("\n");
  // Tên hội thoại/nhóm do người khác đặt nên cũng bọc như nội dung tin
  return toolOk(`${threads.length} hội thoại:\n${wrapUntrustedContent(body, "danh sách hội thoại")}`);
}

export function readThreadTool(
  ctx: ReadToolContext,
  args: { thread_id: string; before_id?: number; limit?: number },
): ToolResult {
  const thread = findThread(ctx.db, args.thread_id);
  if (!thread) return toolError(`Không thấy hội thoại thread_id=${args.thread_id} trong kho. Dùng list_threads để lấy đúng id.`);
  const messages = readThread(ctx.db, {
    threadId: thread.threadId,
    threadType: thread.threadType,
    beforeId: args.before_id,
    limit: args.limit ?? 50,
  });
  if (messages.length === 0) return toolOk("Không còn tin nào cũ hơn trong hội thoại này.");
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const header = `Hội thoại thread_id=${thread.threadId} (${thread.threadType}), ${messages.length} tin, giờ ${tz}.`;
  // Tên hội thoại do người khác đặt nên nằm TRONG khối bọc, cùng nội dung tin
  const body = `Tên hội thoại: ${thread.name ?? "(chưa rõ tên)"}\n${formatMessages(messages, tz)}`;
  const more = `Muốn xem tin cũ hơn: gọi lại với before_id=${messages[0]!.id}.`;
  return toolOk([header, wrapUntrustedContent(body, `hội thoại ${args.thread_id}`), more].join("\n"));
}

export function searchMessagesTool(
  ctx: ReadToolContext,
  args: { query: string; thread_id?: string; from_date?: string; to_date?: string; limit?: number },
): ToolResult {
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const fromIso = args.from_date ? startOfLocalDayUtc(args.from_date, tz) : undefined;
  const toIso = args.to_date ? startOfNextLocalDayUtc(args.to_date, tz) : undefined;
  if (fromIso === null || toIso === null) return toolError("from_date/to_date phải dạng YYYY-MM-DD.");
  const results = searchMessages(ctx.db, {
    query: args.query,
    threadId: args.thread_id,
    fromIso,
    toIso,
    limit: args.limit ?? 20,
  });
  if (results.length === 0) return toolOk(`Không tìm thấy tin nào khớp "${args.query}" (tìm không phân biệt dấu).`);
  const lines = results.map((m) => `(thread_id=${m.threadId})\n${formatMessages([m], tz)}`).join("\n");
  return toolOk(`${results.length} tin khớp, mới nhất trước:\n${wrapUntrustedContent(lines, `tìm "${args.query}"`)}`);
}

export function getAttachmentTool(ctx: ReadToolContext, args: { attachment_id: number }): ToolResult {
  const a = getAttachment(ctx.db, args.attachment_id);
  if (!a) return toolError(`Không có đính kèm #${args.attachment_id}.`);
  const lines = [
    `Đính kèm #${a.id}: ${a.kind}${a.file_name ? ` "${a.file_name}"` : ""}, trạng thái ${a.status}.`,
    `Thuộc tin ${a.msg_id} (thread_id=${a.thread_id}, gửi ${formatLocalTime(String(a.sent_at), ctx.env.ARCHIVE_TIMEZONE)}).`,
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
