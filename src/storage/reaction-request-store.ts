import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";

/**
 * Yêu cầu thả cảm xúc vào một tin (bấm trên dashboard). Dashboard chỉ GHI yêu cầu; daemon (nơi duy nhất gọi Zalo) lấy ra,
 * thả, rồi đánh xong hoặc lỗi. Cảm xúc thật vào kho qua listener như mọi cảm xúc khác.
 */
export type ReactionRequest = {
  id: number;
  msgId: string;
  cliMsgId: string;
  threadId: string;
  threadType: ThreadKind;
  icon: string;
  doneAt: string | null;
  error: string | null;
};

const toRequest = (r: Record<string, unknown>): ReactionRequest => ({
  id: Number(r.id),
  msgId: String(r.msg_id),
  cliMsgId: String(r.cli_msg_id),
  threadId: String(r.thread_id),
  threadType: r.thread_type as ThreadKind,
  icon: String(r.icon),
  doneAt: (r.done_at as string | null) ?? null,
  error: (r.error as string | null) ?? null,
});

export function requestReaction(db: DatabaseSync, r: Omit<ReactionRequest, "id" | "doneAt" | "error">, nowIso: string): number {
  const row = db
    .prepare(
      `INSERT INTO reaction_requests (msg_id, cli_msg_id, thread_id, thread_type, icon, requested_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(r.msgId, r.cliMsgId, r.threadId, r.threadType, r.icon, nowIso) as { id: number };
  return Number(row.id);
}

export function getReactionRequest(db: DatabaseSync, id: number): ReactionRequest | null {
  const row = db.prepare("SELECT * FROM reaction_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toRequest(row) : null;
}

/** Yêu cầu cũ nhất còn chờ daemon làm */
export function nextReactionRequest(db: DatabaseSync): ReactionRequest | null {
  const row = db.prepare("SELECT * FROM reaction_requests WHERE done_at IS NULL AND error IS NULL ORDER BY id LIMIT 1").get() as
    | Record<string, unknown>
    | undefined;
  return row ? toRequest(row) : null;
}

export function markReactionDone(db: DatabaseSync, id: number, nowIso: string): void {
  db.prepare("UPDATE reaction_requests SET done_at = ? WHERE id = ? AND error IS NULL").run(nowIso, id);
}

/** Đánh lỗi cho yêu cầu còn chờ - cũng dùng để bỏ yêu cầu khi hết giờ chờ (không thả muộn). False nếu đã xong / đã lỗi */
export function markReactionFailed(db: DatabaseSync, id: number, error: string): boolean {
  const r = db.prepare("UPDATE reaction_requests SET error = ? WHERE id = ? AND done_at IS NULL AND error IS NULL").run(error.slice(0, 500), id);
  return Number(r.changes) > 0;
}
