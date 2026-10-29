import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { enqueueBatch, enqueueSingle, READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { daemonSendReadiness } from "../storage/daemon-liveness.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { cancelOutboxItem, getOutboxItem, listOutbox, type OutboxStatus } from "../storage/outbox-store.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";

/**
 * Tool GỬI của Claude (người dùng chốt 2026-10-28: Claude gửi ngay khi được bảo).
 * Tool chỉ GHI vào hàng đợi; daemon là nơi duy nhất gọi Zalo, qua cổng gửi.
 * `send_message` chờ daemon gửi xong rồi mới trả kết quả thật (đã gửi / lỗi).
 */
export type SendToolContext = {
  db: DatabaseSync;
  env: AppEnv;
  /** Nick đang dùng ở chế độ Chỉ đọc (đọc lại mỗi lần gọi tool) */
  readOnly: boolean;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Chờ daemon gửi xong tối đa bao lâu */
  waitTimeoutMs?: number;
};

const DEFAULT_WAIT_MS = 60_000;
const POLL_MS = 500;
const FINAL_STATUSES = new Set<OutboxStatus>(["sent", "failed", "cancelled", "rejected"]);

export async function sendMessageTool(ctx: SendToolContext, args: { thread_id: string; text: string }): Promise<ToolResult> {
  // Chốt DB của nick lúc gọi: người dùng đổi nick trong lúc chờ thì vẫn theo dõi đúng mục vừa xếp
  ctx = { ...ctx, db: ctx.db, readOnly: ctx.readOnly };
  if (ctx.readOnly) return toolError(READ_ONLY_ERROR);
  const now = (ctx.now ?? (() => new Date()))();
  const readiness = daemonSendReadiness(ctx.db, now.getTime());
  if (!readiness.ready) return toolError(`Chưa gửi được: ${readiness.reason}`);
  // Đang khóa thì báo thẳng, không xếp hàng: tin nằm chờ rồi bị viết lại và gửi lại
  // nhiều bản khi người dùng mở khóa là đúng kiểu sự cố cần tránh
  const kill = getKillSwitch(ctx.db);
  if (kill.killed) {
    return toolError(`Chưa gửi: việc gửi đang bị KHÓA (${kill.reason ?? "không rõ lý do"}). Người dùng cần mở khóa trên dashboard.`);
  }

  const r = enqueueSingle(ctx, { threadId: args.thread_id, text: args.text, when: "now", createdBy: "mcp" });
  if (!r.ok) return toolError(r.error);
  const id = r.ids[0]!;

  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const deadline = Date.now() + (ctx.waitTimeoutMs ?? DEFAULT_WAIT_MS);
  let item = getOutboxItem(ctx.db, id);
  while (item && !FINAL_STATUSES.has(item.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    item = getOutboxItem(ctx.db, id);
  }
  if (!item) return toolError(`Mục #${id} biến mất khỏi hàng đợi.`);
  if (item.status === "sent") return toolOk(`Đã gửi tới thread_id=${item.threadId} (mục #${id}, msgId ${item.sentMsgId}).`);
  if (item.status === "failed") return toolError(`Gửi hỏng (mục #${id}): ${item.error ?? "không rõ lỗi"}`);
  if (FINAL_STATUSES.has(item.status)) return toolError(`Mục #${id} đã bị ${item.status}, không gửi.`);
  // Hết giờ chờ: chưa ai giành thì HỦY luôn (để tin không đi muộn ngoài ý người dùng);
  // daemon đã giành thì tin đang trên đường đi - tuyệt đối không gửi lại
  const waited = Math.round((ctx.waitTimeoutMs ?? DEFAULT_WAIT_MS) / 1000);
  if (cancelOutboxItem(ctx.db, id)) {
    return toolError(`Daemon không gửi kịp trong ${waited} giây nên đã HỦY mục #${id} - tin CHƯA đi. Kiểm tra dashboard rồi thử lại.`);
  }
  return toolError(`Mục #${id} đang được gửi nhưng chưa xác nhận xong. KHÔNG gửi lại; xem kết quả bằng list_outbox.`);
}

export function scheduleMessageTool(
  ctx: SendToolContext,
  args: { thread_id: string; text: string; send_date: string; send_time: string; note?: string },
): ToolResult {
  const r = enqueueSingle(ctx, {
    threadId: args.thread_id,
    text: args.text,
    when: "schedule",
    sendDate: args.send_date,
    sendTime: args.send_time,
    note: args.note,
    createdBy: "mcp",
  });
  if (!r.ok) return toolError(r.error);
  return toolOk(`Đã hẹn gửi mục #${r.ids[0]} lúc ${formatLocalTime(r.notBefore, ctx.env.ARCHIVE_TIMEZONE)} (giờ ${ctx.env.ARCHIVE_TIMEZONE}).`);
}

export function sendBatchTool(
  ctx: SendToolContext,
  args: { items: Array<{ thread_id: string; text: string }>; send_date?: string; send_time?: string; note?: string },
): ToolResult {
  const scheduled = Boolean(args.send_date || args.send_time);
  const r = enqueueBatch(ctx, {
    items: args.items.map((i) => ({ threadId: i.thread_id, text: i.text })),
    when: scheduled ? "schedule" : "now",
    sendDate: args.send_date,
    sendTime: args.send_time,
    note: args.note,
    createdBy: "mcp",
  });
  if (!r.ok) return toolError(r.error);
  const start = r.notBefore ? `bắt đầu sau ${formatLocalTime(r.notBefore, ctx.env.ARCHIVE_TIMEZONE)}` : "bắt đầu ngay";
  return toolOk(
    `Đã xếp lô ${r.ids.length} tin (${start}): ${r.ids.map((id) => `#${id}`).join(", ")}. ` +
      "Daemon gửi TỪNG tin có nhịp, chỉ trong khung giờ của lô; theo dõi bằng list_outbox." +
      (r.warnings.length ? `\nLưu ý: ${r.warnings.join("; ")}.` : ""),
  );
}

export function draftMessageTool(ctx: SendToolContext, args: { thread_id: string; text: string; note?: string }): ToolResult {
  const r = enqueueSingle(ctx, { threadId: args.thread_id, text: args.text, when: "draft", note: args.note, createdBy: "mcp" });
  if (!r.ok) return toolError(r.error);
  return toolOk(`Đã lưu nháp #${r.ids[0]}. Chưa gửi: người dùng xem và bấm Duyệt trên dashboard (Hàng đợi).`);
}

export function listOutboxTool(ctx: SendToolContext, args: { status?: OutboxStatus; limit?: number }): ToolResult {
  const items = listOutbox(ctx.db, { statuses: args.status ? [args.status] : undefined, limit: args.limit ?? 30 });
  if (items.length === 0) return toolOk("Hàng đợi gửi trống.");
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  const lines = items.map((i) => {
    const when = i.notBefore ? ` hẹn ${formatLocalTime(i.notBefore, tz)}` : "";
    const err = i.error ? ` lỗi: ${i.error}` : "";
    const preview = i.text.length > 80 ? `${i.text.slice(0, 80)}...` : i.text;
    return `#${i.id} [${i.status}${i.mode === "batch" ? ", lô" : ""}] -> ${i.threadId}${when}: ${preview}${err}`;
  });
  return toolOk(lines.join("\n"));
}

export function cancelOutboxTool(ctx: SendToolContext, args: { id: number }): ToolResult {
  const item = getOutboxItem(ctx.db, args.id);
  if (!item) return toolError(`Không có mục #${args.id}.`);
  if (!cancelOutboxItem(ctx.db, args.id)) {
    return toolError(`Không hủy được #${args.id}: đang ở trạng thái ${item.status} (chỉ hủy được draft/approved).`);
  }
  return toolOk(`Đã hủy #${args.id}.`);
}
