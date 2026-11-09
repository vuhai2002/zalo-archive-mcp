import type { DatabaseSync } from "node:sqlite";
import { getReactionRequest, markReactionFailed, requestReaction } from "../storage/reaction-request-store.js";
import { QUICK_REACTIONS } from "./reaction-sender-loop.js";

/**
 * Thả cảm xúc vào một tin trong kho, dùng CHUNG cho dashboard (nút Thích / thanh cảm xúc) và MCP (`react_to_message`):
 * kiểm tin, ghi yêu cầu cho daemon (nơi duy nhất gọi Zalo), chờ daemon làm xong. Quá giờ chờ thì bỏ yêu cầu để không thả muộn.
 */
const POLL_MS = 150;
const ICONS = new Set<string>(QUICK_REACTIONS);

type Row = { msg_id: string; cli_msg_id: string | null; thread_id: string; thread_type: "user" | "group"; msg_type: string; recalled_at: string | null };

/** Lý do không thả được (null = được) */
function problemOf(row: Row | undefined): string | null {
  if (!row) return "Tin này không có trong kho.";
  if (row.recalled_at) return "Tin đã bị thu hồi.";
  if (row.msg_type === "group_event") return "Không thả cảm xúc vào thông báo nhóm.";
  // Tin lấy từ điện thoại / kiểu cũ không có mã tin thật của Zalo
  if (!/^\d+$/.test(row.msg_id) || !row.cli_msg_id || !/^\d+$/.test(row.cli_msg_id)) return "Kho không có mã Zalo của tin này để thả cảm xúc.";
  return null;
}

export type ReactionOutcome = { ok: true } | { ok: false; error: string; timedOut?: boolean };

export async function reactToArchivedMessage(
  db: DatabaseSync,
  messageId: number,
  icon: string,
  o: { waitMs: number; now?: () => Date; sleep?: (ms: number) => Promise<void> },
): Promise<ReactionOutcome> {
  if (!ICONS.has(icon)) return { ok: false, error: "Cảm xúc không hợp lệ." };
  const row = db
    .prepare("SELECT msg_id, cli_msg_id, thread_id, thread_type, msg_type, recalled_at FROM messages WHERE id = ?")
    .get(messageId) as Row | undefined;
  const problem = problemOf(row);
  if (problem || !row) return { ok: false, error: problem ?? "Tin này không có trong kho." };

  const now = (o.now ?? (() => new Date()))();
  const id = requestReaction(
    db,
    { msgId: row.msg_id, cliMsgId: row.cli_msg_id!, threadId: row.thread_id, threadType: row.thread_type, icon },
    now.toISOString(),
  );
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const deadline = Date.now() + o.waitMs;
  for (;;) {
    const r = getReactionRequest(db, id);
    if (r?.doneAt) return { ok: true };
    if (r?.error) return { ok: false, error: r.error };
    if (Date.now() >= deadline) break;
    await sleep(POLL_MS);
  }
  if (markReactionFailed(db, id, "Hết giờ chờ daemon")) {
    return { ok: false, timedOut: true, error: "Daemon chưa thả kịp (có thể đang mất kết nối Zalo) - đã bỏ, thử lại sau." };
  }
  return getReactionRequest(db, id)?.doneAt ? { ok: true } : { ok: false, error: getReactionRequest(db, id)?.error ?? "Không rõ kết quả." };
}
