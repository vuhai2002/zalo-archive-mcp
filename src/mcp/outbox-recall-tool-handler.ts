import { READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { recallProblem } from "../outbox/outbox-recall-loop.js";
import { daemonSendReadiness } from "../storage/daemon-liveness.js";
import { markRecallFailed, requestRecall } from "../storage/outbox-recall-store.js";
import { getOutboxItem } from "../storage/outbox-store.js";
import type { SendToolContext } from "./outbox-send-tool-handlers.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";

/**
 * Lệnh `recall_message`: thu hồi một tin kho đã gửi, CHỈ khi người dùng bảo (người dùng chốt 2026-11-08). Tool chỉ GHI yêu
 * cầu; daemon thu hồi bằng phiên Zalo đang chạy rồi tool báo kết quả thật. Hết giờ chờ mà daemon chưa làm thì bỏ yêu cầu,
 * để tin không bị thu hồi muộn ngoài ý người dùng.
 */
const DEFAULT_WAIT_MS = 30_000;
const POLL_MS = 500;

export async function recallMessageTool(ctx: SendToolContext, args: { id: number }): Promise<ToolResult> {
  if (ctx.readOnly) return toolError(READ_ONLY_ERROR);
  const item = getOutboxItem(ctx.db, args.id);
  if (!item) return toolError(`Không có mục #${args.id} trong hàng đợi.`);
  const problem = recallProblem(ctx.db, item);
  if (problem) return toolError(`Không thu hồi #${args.id}: ${problem}`);
  const now = (ctx.now ?? (() => new Date()))();
  const readiness = daemonSendReadiness(ctx.db, now.getTime());
  if (!readiness.ready) return toolError(`Chưa thu hồi được: ${readiness.reason}`);
  if (!requestRecall(ctx.db, item.id, now.toISOString())) return toolError(`Mục #${args.id} đang chờ thu hồi rồi.`);

  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const deadline = Date.now() + (ctx.waitTimeoutMs ?? DEFAULT_WAIT_MS);
  let current = getOutboxItem(ctx.db, item.id);
  while (current && !current.recalledAt && !current.recallError && Date.now() < deadline) {
    await sleep(POLL_MS);
    current = getOutboxItem(ctx.db, item.id);
  }
  if (current?.recalledAt) return toolOk(`Đã thu hồi tin #${item.id} (msgId ${item.sentMsgId}) trong thread_id=${item.threadId}.`);
  if (current?.recallError) return toolError(`Không thu hồi được #${item.id}: ${current.recallError}`);
  if (markRecallFailed(ctx.db, item.id, "Hết giờ chờ daemon - đã bỏ yêu cầu thu hồi")) {
    return toolError(`Daemon không thu hồi kịp nên đã bỏ yêu cầu - tin #${item.id} CHƯA bị thu hồi. Kiểm tra dashboard rồi thử lại.`);
  }
  return getOutboxItem(ctx.db, item.id)?.recalledAt
    ? toolOk(`Đã thu hồi tin #${item.id} (msgId ${item.sentMsgId}).`)
    : toolError(`Chưa rõ kết quả thu hồi #${item.id} - xem list_outbox.`);
}
