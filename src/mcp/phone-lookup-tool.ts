import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { localPhone, normalizeVnPhone } from "../phone-lookup/phone-lookup-rules.js";
import { localHour, startOfTodayUtc } from "../shared/local-date-range.js";
import { daemonSendReadiness } from "../storage/daemon-liveness.js";
import {
  cancelPendingPhoneLookups,
  countLookupAttemptsSince,
  getLookupPause,
  getPhoneLookups,
  queuePhoneLookups,
  requeuePhoneLookups,
  type PhoneLookupRow,
} from "../storage/phone-lookup-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { getSendSettings } from "../storage/send-settings-store.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import type { SendToolContext } from "./outbox-send-tool-handlers.js";
import { safeToolHandler, toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

export type LookupPhonesArgs = { phones: string[]; recheck?: boolean; cancel?: boolean };

/** Vì sao vòng tra ở daemon chưa tra được số đang chờ (cùng các điều kiện vòng tra kiểm), để Claude báo người dùng */
function lookupStallReasons(ctx: SendToolContext, now: Date, usedToday: number): string[] {
  const reasons: string[] = [];
  const kill = getKillSwitch(ctx.db);
  if (kill.killed) reasons.push(`Khóa khẩn cấp đang bật (${kill.reason ?? "không rõ lý do"}) - người dùng mở khóa trên dashboard`);
  const readiness = daemonSendReadiness(ctx.db, now.getTime());
  if (!readiness.ready) reasons.push(readiness.reason);
  const s = getSendSettings(ctx.db, ctx.env);
  const hour = localHour(ctx.env.ARCHIVE_TIMEZONE, now);
  if (hour < s.batchWindowStartHour || hour >= s.batchWindowEndHour) {
    reasons.push(`đang ngoài khung giờ tra ${s.batchWindowStartHour}h-${s.batchWindowEndHour}h (theo khung giờ gửi lô)`);
  }
  if (usedToday >= s.lookupDailyCap) {
    reasons.push(`đã đủ trần hôm nay (${usedToday}/${s.lookupDailyCap} số${s.lookupDailyCap === 0 ? ", trần 0 là ngừng tra" : ""})`);
  }
  return reasons;
}

function describeRow(r: PhoneLookupRow | undefined): string {
  if (!r) return "chưa xếp tra";
  if (r.status === "found") return `có Zalo: ${r.zaloName ?? "(không tên)"} | thread_id=${r.userId}`;
  if (r.status === "no_zalo") return `không có Zalo (${r.resultCode ?? "?"} ${r.resultMessage ?? ""})`.replace(" )", ")");
  if (r.status === "failed") return `lỗi khi tra: ${r.resultMessage ?? "không rõ"}`;
  return "đang chờ tra";
}

/**
 * `lookup_phones`: Claude đưa danh sách số, kho xếp vào hàng đợi tra (daemon tra dần như ô Tìm kiếm của Zalo) và trả kết quả
 * đã có. Gọi lại cùng danh sách để xem tiến độ. Không gọi Zalo ở đây. Tên Zalo là chữ do người khác đặt nên nằm trong khối
 * dữ liệu không tin cậy.
 */
export function lookupPhonesTool(ctx: SendToolContext, args: LookupPhonesArgs): ToolResult {
  if (args.recheck && args.cancel) return toolError("Chỉ dùng một trong recheck / cancel mỗi lần.");
  const now = (ctx.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const invalid: string[] = [];
  const phones: string[] = [];
  for (const raw of args.phones) {
    const p = normalizeVnPhone(raw);
    if (!p) invalid.push(raw.trim() || "(trống)");
    else if (!phones.includes(p)) phones.push(p);
  }

  const notes: string[] = [];
  if (ctx.readOnly) notes.push(`${READ_ONLY_ERROR} Không xếp / hủy tra số; dưới đây là kết quả đã có.`);
  else if (args.cancel) notes.push(`Đã bỏ ${cancelPendingPhoneLookups(ctx.db, phones)} số đang chờ tra.`);
  else {
    if (args.recheck) notes.push(`Đã xếp lại ${requeuePhoneLookups(ctx.db, phones, nowIso)} số để tra lại.`);
    const added = queuePhoneLookups(ctx.db, phones, nowIso);
    if (added > 0) notes.push(`Đã xếp mới ${added} số.`);
  }

  const rows = new Map(getPhoneLookups(ctx.db, phones).map((r) => [r.phone, r]));
  const count = (s: PhoneLookupRow["status"]) => [...rows.values()].filter((r) => r.status === s).length;
  const settings = getSendSettings(ctx.db, ctx.env);
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const usedToday = countLookupAttemptsSince(ctx.db, startOfTodayUtc(tz, now));
  const pending = count("pending");

  const summary = [
    `${phones.length + invalid.length} số: có Zalo ${count("found")}, không có Zalo ${count("no_zalo")}, đang chờ tra ${pending}, ` +
      `lỗi ${count("failed")}, không hợp lệ ${invalid.length}. Hôm nay đã tra ${usedToday}/${settings.lookupDailyCap} số.`,
    ...notes,
  ];
  const pause = getLookupPause(ctx.db);
  if (pause && Date.parse(pause.until) > now.getTime()) {
    summary.push(`Đang tạm dừng tra tới ${formatLocalTime(pause.until, tz)} (giờ ${tz}): ${pause.reason}`);
  }
  const stalls = pending > 0 ? lookupStallReasons(ctx, now, usedToday) : [];
  if (stalls.length) summary.push(`Số đang chờ chưa tra được vì: ${stalls.join("; ")}`);
  const leftToday = Math.max(0, settings.lookupDailyCap - usedToday);
  if (pending > leftToday && settings.lookupDailyCap > 0) {
    const days = Math.ceil((pending - leftToday) / settings.lookupDailyCap) + (leftToday > 0 ? 1 : 0);
    summary.push(`Còn ${pending} số chờ tra; với trần ${settings.lookupDailyCap} số/ngày cần khoảng ${days} ngày.`);
  }
  if (invalid.length) summary.push(`Số không hợp lệ (không tra, chỉ nhận số di động Việt Nam): ${invalid.join(", ")}`);

  const list = phones.map((p) => `${localPhone(p)} -> ${describeRow(rows.get(p))}`).join("\n");
  const hint =
    "Gọi lại lookup_phones với cùng danh sách để xem tiến độ. TRƯỚC khi gửi, so tên Zalo với tên trong danh sách và báo người " +
    "dùng số nghi nhầm người. Gửi bằng send_batch (hoặc send_message) với thread_id ở trên.";
  return toolOk([...summary, "", list ? wrapUntrustedContent(list, "kết quả tra số") : "(không có số hợp lệ)", "", hint].join("\n"));
}

const SENDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

export function registerPhoneLookupTool(server: McpServer, ctx: SendToolContext): void {
  server.registerTool(
    "lookup_phones",
    {
      description:
        "Tra số điện thoại trên Zalo (như gõ số vào ô Tìm kiếm của Zalo) để nhắn cho người CHƯA kết bạn từ một danh sách số điện thoại. " +
        "Kho xếp số vào hàng đợi, daemon tra dần theo nhịp và trần ngày (Cài đặt), nên lần đầu phần lớn số là 'đang chờ tra': " +
        "gọi lại với cùng danh sách để xem tiến độ. Kết quả: có Zalo (tên Zalo + thread_id để gửi bằng send_batch / send_message), " +
        "không có Zalo (báo người dùng để liên hệ cách khác), lỗi. Mỗi số chỉ tra một lần rồi lưu cho các đợt gửi sau. " +
        "recheck = tra lại các số trước đó không có Zalo / lỗi; cancel = bỏ các số còn chờ (đưa nhầm danh sách).",
      inputSchema: {
        phones: z.array(z.string().min(1).max(40)).min(1).max(500).describe("Số điện thoại, ghi kiểu gì cũng được (0..., +84..., có dấu chấm / cách)"),
        recheck: z.boolean().optional(),
        cancel: z.boolean().optional(),
      },
      annotations: SENDS,
    },
    safeToolHandler((a) => lookupPhonesTool(ctx, a)),
  );
}
