import { READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { reactToArchivedMessage } from "../outbox/request-message-reaction.js";
import { daemonSendReadiness } from "../storage/daemon-liveness.js";
import type { SendToolContext } from "./outbox-send-tool-handlers.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";

/** Sáu cảm xúc nhanh của Zalo theo tên dễ gọi -> mã Zalo (khớp QUICK_REACTIONS) */
export const REACTION_CODES = {
  like: "/-strong",
  heart: "/-heart",
  haha: ":>",
  wow: ":o",
  cry: ":-((",
  angry: ":-h",
} as const;
export type ReactionName = keyof typeof REACTION_CODES;
const EMOJI: Record<ReactionName, string> = { like: "👍", heart: "❤️", haha: "😆", wow: "😮", cry: "😭", angry: "😡" };
const DEFAULT_WAIT_MS = 15_000;

/**
 * Lệnh `react_to_message`: thả cảm xúc vào một tin như bấm trên Zalo, khi người dùng bảo. Đi đúng đường của nút Thích trên
 * dashboard: ghi yêu cầu, daemon thả bằng phiên đang chạy, tool chờ kết quả thật.
 */
export async function reactToMessageTool(ctx: SendToolContext, args: { message_id: number; reaction: ReactionName }): Promise<ToolResult> {
  if (ctx.readOnly) return toolError(READ_ONLY_ERROR);
  const now = ctx.now ?? (() => new Date());
  const readiness = daemonSendReadiness(ctx.db, now().getTime());
  if (!readiness.ready) return toolError(`Chưa thả được cảm xúc: ${readiness.reason}`);
  const r = await reactToArchivedMessage(ctx.db, args.message_id, REACTION_CODES[args.reaction], {
    waitMs: ctx.waitTimeoutMs ?? DEFAULT_WAIT_MS,
    now,
    sleep: ctx.sleep,
  });
  if (!r.ok) return toolError(`Không thả được cảm xúc vào tin #${args.message_id}: ${r.error}`);
  return toolOk(`Đã thả ${EMOJI[args.reaction]} vào tin #${args.message_id}.`);
}
