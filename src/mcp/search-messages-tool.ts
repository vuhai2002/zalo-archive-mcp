import { startOfLocalDayUtc, startOfNextLocalDayUtc } from "../shared/local-date-range.js";
import { countMessages, searchMessages } from "../storage/message-search-queries.js";
import { findSendersByName } from "../storage/message-sender-lookup.js";
import { getMeta } from "../storage/thread-directory-store.js";
import { REPLY_HINT, type ReadToolContext } from "./archive-read-tool-handlers.js";
import { formatMessages } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

export type SearchMessagesArgs = {
  query?: string;
  thread_id?: string;
  sender_id?: string;
  sender_name?: string;
  from_me?: boolean;
  files_only?: boolean;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
};

/**
 * Tìm tin trên toàn kho hoặc một hội thoại: theo chữ (không dấu), người gửi (mã, tên, hay tin của chính mình), khoảng ngày,
 * chỉ tin có file. Có PHÂN TRANG: báo tổng số tin khớp và offset để lấy trang tiếp, để agent không tưởng 20 tin đầu là hết.
 * Tên người gửi trùng nhiều người thì liệt kê cho agent chọn sender_id, không tự đoán.
 */
export function searchMessagesTool(ctx: ReadToolContext, args: SearchMessagesArgs): ToolResult {
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const fromIso = args.from_date ? startOfLocalDayUtc(args.from_date, tz) : undefined;
  const toIso = args.to_date ? startOfNextLocalDayUtc(args.to_date, tz) : undefined;
  if (fromIso === null || toIso === null) return toolError("from_date/to_date phải dạng YYYY-MM-DD.");
  if ([args.sender_id, args.sender_name, args.from_me ? true : undefined].filter((x) => x !== undefined && x !== "").length > 1) {
    return toolError("Chỉ dùng một trong sender_id, sender_name, from_me mỗi lần.");
  }

  let senderId = args.sender_id;
  let senderNote = senderId ? ` (lọc người gửi sender_id=${senderId})` : "";
  if (args.from_me) {
    const self = getMeta(ctx.db, "self_uid");
    if (!self) return toolError("Kho chưa biết mã nick của bạn (chưa đăng nhập Zalo lần nào) nên chưa lọc được tin của bạn.");
    senderId = self;
    senderNote = " (tin của bạn)";
  } else if (args.sender_name?.trim()) {
    const found = findSendersByName(ctx.db, args.sender_name, { threadId: args.thread_id, limit: 10 });
    if (found.length === 0) {
      return toolOk(`Không thấy người gửi nào tên "${args.sender_name}"${args.thread_id ? " trong hội thoại này" : ""} (tìm không dấu, khớp một phần).`);
    }
    if (found.length > 1) {
      const list = found.map((s) => `${s.name ?? "(chưa rõ tên)"} | sender_id=${s.senderId} | ${s.count} tin`).join("\n");
      return toolOk(
        `${found.length} người gửi khớp "${args.sender_name}" - gọi lại search_messages với sender_id của đúng người:\n` +
          wrapUntrustedContent(list, "người gửi khớp tên"),
      );
    }
    senderId = found[0]!.senderId;
    senderNote = ` (lọc người gửi sender_id=${senderId})`;
  }
  if (!args.query?.trim() && !senderId && !fromIso && !toIso) {
    return toolError("Cần ít nhất một điều kiện: query, người gửi (sender_id / sender_name / from_me), hoặc from_date / to_date.");
  }

  const filter = { query: args.query, threadId: args.thread_id, senderId, files: args.files_only ? ("only" as const) : undefined, fromIso, toIso };
  const total = countMessages(ctx.db, filter);
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 20;
  if (total === 0) return toolOk(`Không tìm thấy tin nào khớp${args.query ? ` "${args.query}"` : ""}${senderNote} (tìm không phân biệt dấu).`);
  const results = searchMessages(ctx.db, { ...filter, limit, offset });
  if (results.length === 0) return toolOk(`${total} tin khớp${senderNote}, nhưng không còn tin nào từ offset=${offset}.`);

  const from = offset + 1;
  const to = offset + results.length;
  const rest = total - to;
  const header = `${total} tin khớp${senderNote}. Trang này: tin ${from}-${to}, mới nhất trước.`;
  const next = rest > 0 ? `Còn ${rest} tin: gọi lại với offset=${to} (cùng điều kiện) để lấy tiếp.` : "Đã hết kết quả.";
  const lines = results.map((m) => `(thread_id=${m.threadId})\n${formatMessages([m], tz)}`).join("\n");
  return toolOk([header, wrapUntrustedContent(lines, `tìm "${args.query ?? ""}"`), next, REPLY_HINT].join("\n"));
}
