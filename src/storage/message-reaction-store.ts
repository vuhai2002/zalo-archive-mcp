import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { emojiForZaloCode } from "../archive/zalo-emoticon-emoji.js";

/** Một lần bấm cảm xúc (hoặc gỡ cảm xúc), đã chuẩn hóa từ sự kiện zca-js */
export type ReactionInput = {
  /** id riêng của LẦN bấm này (msgId của sự kiện reaction) - khóa khử trùng */
  actionId: string;
  /** msg_id (id toàn cục) của các tin được thả cảm xúc */
  targetMsgIds: string[];
  reactorId: string;
  /** Mã cảm xúc Zalo; chuỗi rỗng = gỡ hết cảm xúc của người này trên tin */
  icon: string;
  reactedAt: string;
  threadId: string;
  threadType: ThreadKind;
};

/** Một loại cảm xúc trên tin: `count` = tổng số lần bấm (như Zalo), `names` = ai đã bấm */
export type ReactionSummary = { icon: string; emoji: string | null; count: number; mine: boolean; names: string[] };

/**
 * Ghi một lần bấm. Sự kiện lặp (lấy bù, phát lại nhật ký) bị bỏ nhờ khóa (tin, id lần bấm),
 * nên đếm không bị nhân đôi; thứ tự tới không quan trọng vì lúc đọc mới tính theo mốc giờ.
 */
export function applyReaction(db: DatabaseSync, r: ReactionInput): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO message_reaction_taps (msg_id, action_id, reactor_id, icon, reacted_at, thread_id, thread_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const msgId of r.targetMsgIds) stmt.run(msgId, r.actionId, r.reactorId, r.icon, r.reactedAt, r.threadId, r.threadType);
}

type TapRow = { msg_id: string; reactor_id: string; icon: string; reacted_at: string; display_name: string | null };

/**
 * Cảm xúc hiện tại của các tin, gộp theo loại (loại được bấm đầu tiên đứng trước). Với mỗi
 * người: chỉ tính các lần bấm SAU lần gỡ gần nhất của người đó trên tin.
 */
export function reactionSummaries(db: DatabaseSync, msgIds: string[], selfUid: string | null): Map<string, ReactionSummary[]> {
  const out = new Map<string, ReactionSummary[]>();
  if (msgIds.length === 0) return out;
  const rows = db
    .prepare(
      `SELECT t.msg_id, t.reactor_id, t.icon, t.reacted_at, COALESCE(c.alias, c.display_name) AS display_name FROM message_reaction_taps t
       LEFT JOIN contacts c ON c.user_id = t.reactor_id
       WHERE t.msg_id IN (${msgIds.map(() => "?").join(",")}) ORDER BY t.reacted_at, t.action_id`,
    )
    .all(...msgIds) as TapRow[];

  // Mốc gỡ gần nhất của từng người trên từng tin
  const clearedAt = new Map<string, string>();
  for (const row of rows) if (row.icon === "") clearedAt.set(`${row.msg_id}|${row.reactor_id}`, row.reacted_at);

  for (const row of rows) {
    const cleared = clearedAt.get(`${row.msg_id}|${row.reactor_id}`);
    if (row.icon === "" || (cleared !== undefined && row.reacted_at <= cleared)) continue;
    const list = out.get(row.msg_id) ?? [];
    let s = list.find((x) => x.icon === row.icon);
    if (!s) {
      s = { icon: row.icon, emoji: emojiForZaloCode(row.icon), count: 0, mine: false, names: [] };
      list.push(s);
    }
    const mine = selfUid !== null && row.reactor_id === selfUid;
    const name = mine ? "Bạn" : (row.display_name ?? row.reactor_id);
    s.count++;
    s.mine ||= mine;
    if (!s.names.includes(name)) s.names.push(name);
    out.set(row.msg_id, list);
  }
  return out;
}
