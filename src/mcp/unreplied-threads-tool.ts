import { DateTime } from "luxon";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { startOfLocalDayUtc } from "../shared/local-date-range.js";
import { listUnrepliedThreads, UNREPLIED_SCAN_LIMIT as SCAN_LIMIT, type UnrepliedThread } from "../storage/unreplied-thread-queries.js";
import type { ReadToolContext } from "./archive-read-tool-handlers.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

/** Không nói ngày: xét tin trong chừng này ngày gần đây (nhóm phải quét dữ liệu gốc, xét quá nhiều ngày thì chậm) */
const DEFAULT_DAYS = 14;

const NOTE =
  'Kho không biết bạn đã đọc tin trên điện thoại hay chưa: "chưa trả lời" = sau tin của họ bạn chưa nhắn lại, chưa nghe máy, ' +
  "chưa thả cảm xúc. Nhóm chỉ tính tin nhắc tên bạn (không tính @All) hoặc trả lời tin của bạn. Xem cả đoạn: read_thread với " +
  'around_id = số sau "từ #".';

function formatUnreplied(t: UnrepliedThread, timeZone: string): string {
  const latest = t.pending[0]!;
  const first = t.pending.at(-1)!;
  const name = t.thread.name ?? "(chưa rõ tên)";
  const at = formatLocalTime(latest.sentAt, timeZone);
  if (t.reason === "mention") {
    return `- ${name} | thread_id=${t.thread.threadId} | nhóm | ${t.pending.length} tin nhắc tên / trả lời bạn chưa đáp (từ #${first.id}) | mới nhất ${at}, ${latest.senderName ?? "?"}: "${latest.preview}"`;
  }
  const kind = t.thread.isFriend ? "bạn bè" : "1-1 (chưa kết bạn)";
  const count = t.pending.length >= SCAN_LIMIT ? `${SCAN_LIMIT}+` : String(t.pending.length);
  const what = latest.missedCall ? `cuộc gọi nhỡ lúc ${at}` : `mới nhất ${at}: "${latest.preview}"`;
  return `- ${name} | thread_id=${t.thread.threadId} | ${kind} | ${count} tin chưa trả lời (từ #${first.id}) | ${what}`;
}

/** list_threads với unreplied_only: hội thoại đang chờ người dùng trả lời, tin chờ mới nhất trước */
export function unrepliedThreadsTool(ctx: ReadToolContext, args: { query?: string; from_date?: string; limit?: number }): ToolResult {
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const fromDate = args.from_date ?? DateTime.now().setZone(tz).minus({ days: DEFAULT_DAYS }).toISODate()!;
  const sinceIso = startOfLocalDayUtc(fromDate, tz);
  if (!sinceIso) return toolError("from_date phải dạng YYYY-MM-DD.");
  const needle = foldVietnameseForSearch(args.query?.trim() ?? "");
  const all = listUnrepliedThreads(ctx.db, { sinceIso }).filter(
    (t) => !needle || t.thread.threadId === args.query?.trim() || foldVietnameseForSearch(t.thread.name ?? "").includes(needle),
  );
  const since = `từ ${DateTime.fromISO(fromDate).toFormat("dd/LL/yyyy")}`;
  if (all.length === 0) return toolOk(`Không có hội thoại nào chờ bạn trả lời ${since}${args.query ? ` khớp "${args.query}"` : ""}.\n${NOTE}`);
  const shown = all.slice(0, args.limit ?? 30);
  const more = all.length > shown.length ? `\nCòn ${all.length - shown.length} hội thoại nữa: tăng limit hoặc thu hẹp from_date.` : "";
  // Tên hội thoại và đầu tin do người khác viết nên nằm trong khối bọc
  const body = shown.map((t) => formatUnreplied(t, tz)).join("\n");
  return toolOk(
    `${all.length} hội thoại chờ bạn trả lời ${since} (giờ ${tz}), tin chờ mới nhất trước:\n` +
      `${wrapUntrustedContent(body, "hội thoại chưa trả lời")}${more}\n${NOTE}`,
  );
}
