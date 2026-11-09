import { enqueueSingle, READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { daemonSendReadiness } from "../storage/daemon-liveness.js";
import { cancelOutboxItem, getOutboxItem, type OutboxItem, type OutboxStatus } from "../storage/outbox-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import type { SendToolContext } from "./outbox-send-tool-handlers.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";

const POLL_MS = 500;
const FINAL_STATUSES = new Set<OutboxStatus>(["sent", "failed", "cancelled", "rejected"]);
type SendNowRequest = Omit<Parameters<typeof enqueueSingle>[1], "when" | "createdBy">;

/**
 * "Gửi ngay" của Claude (send_message, send_file): xếp hàng rồi CHỜ daemon gửi xong mới trả kết quả thật. Hết giờ chờ mà
 * daemon chưa giành mục thì hủy luôn (tin không đi muộn ngoài ý người dùng); đã giành thì tin đang đi - không gửi lại.
 */
export async function sendNowAndAwait(
  ctx: SendToolContext,
  req: SendNowRequest,
  o: { defaultWaitMs: number; describe: (item: OutboxItem) => string },
): Promise<ToolResult> {
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

  const r = enqueueSingle(ctx, { ...req, when: "now", createdBy: "mcp" });
  if (!r.ok) return toolError(r.error);
  const id = r.ids[0]!;

  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const waitMs = ctx.waitTimeoutMs ?? o.defaultWaitMs;
  const deadline = Date.now() + waitMs;
  let item = getOutboxItem(ctx.db, id);
  while (item && !FINAL_STATUSES.has(item.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    item = getOutboxItem(ctx.db, id);
  }
  if (!item) return toolError(`Mục #${id} biến mất khỏi hàng đợi.`);
  if (item.status === "sent") return toolOk(`${o.describe(item)} (mục #${id}, msgId ${item.sentMsgId}).`);
  if (item.status === "failed") return toolError(`Gửi hỏng (mục #${id}): ${item.error ?? "không rõ lỗi"}`);
  if (FINAL_STATUSES.has(item.status)) return toolError(`Mục #${id} đã bị ${item.status}, không gửi.`);
  if (cancelOutboxItem(ctx.db, id)) {
    return toolError(`Daemon không gửi kịp trong ${Math.round(waitMs / 1000)} giây nên đã HỦY mục #${id} - tin CHƯA đi. Kiểm tra dashboard rồi thử lại.`);
  }
  return toolError(`Mục #${id} đang được gửi nhưng chưa xác nhận xong. KHÔNG gửi lại; xem kết quả bằng list_outbox.`);
}
