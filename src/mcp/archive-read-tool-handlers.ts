import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { getAttachment } from "../storage/attachment-queue-store.js";
import { findThread, listThreads, readThread } from "../storage/message-read-queries.js";
import { readThreadAfter, readThreadAround } from "../storage/message-window-queries.js";
import { threadPosition } from "../storage/thread-position-counts.js";
import { formatLocalTime, formatMessages, formatThread } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

/** Handler THUẦN của các tool đọc: nhận db + env + tham số đã validate, trả ToolResult */
/** `accountId`: thư mục nick đang dùng. Bản chạy thật đọc lại mỗi lần (xem active-account-tool-context.ts) */
export type ReadToolContext = { db: DatabaseSync; env: AppEnv; mediaRoot: string; accountId: string };

/**
 * Nhắc cách trả lời (trích dẫn) ngay trong KẾT QUẢ đọc: phiên Claude chạy nhiều ngày giữ mô tả lệnh gửi nạp từ trước khi có
 * `reply_to` (và cả kết luận cũ "không trả lời được"); kết quả đọc thì luôn mới nên phiên cũ vẫn thấy.
 */
export const REPLY_HINT = "Trả lời (trích dẫn) một tin như bấm Trả lời trên Zalo: send_message hoặc send_file với reply_to = số # của tin đó.";

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
  // Còn bao nhiêu tin hai phía: agent biết còn phải đọc tiếp hay đã đủ, không dừng ở trang đầu rồi sót
  const first = messages[0]!;
  const last = messages.at(-1)!;
  const pos = threadPosition(ctx.db, thread, first, last);
  const older = pos.older > 0 ? `Còn ${pos.older} tin cũ hơn (before_id=${first.id})` : "Không còn tin cũ hơn";
  const newer = pos.newer > 0 ? `còn ${pos.newer} tin mới hơn (after_id=${last.id}).` : "không còn tin mới hơn.";
  const more = `Hội thoại có ${pos.total} tin; trang này ${messages.length} tin. ${older}, ${newer}`;
  return toolOk([header, wrapUntrustedContent(body, `hội thoại ${args.thread_id}`), more, REPLY_HINT].join("\n"));
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
