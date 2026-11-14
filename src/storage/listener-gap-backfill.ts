import type { DatabaseSync } from "node:sqlite";
import { backfillForGap } from "./backfill-run-store.js";
import type { ListenerGap } from "./connection-event-store.js";
import { phoneSyncCovers } from "./phone-sync-coverage-store.js";

/**
 * Gắn cho mỗi khoảng listener không nghe (đã nối lại) kết quả lấy bù sau đó và số tin kho đang có trong khoảng, để báo
 * "đã lấy bù đủ" / "có thể thiếu" / "chưa rõ" thay vì coi mọi khoảng là có thể thiếu. Khoảng chưa nối lại hay chỉ suy ra từ
 * heartbeat thì giữ nguyên.
 */
export function annotateGapsWithBackfill(db: DatabaseSync, gaps: ListenerGap[]): ListenerGap[] {
  const count = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sent_at >= ? AND sent_at < ?");
  return gaps.map((g) => {
    if (!g.to || g.suspected) return g;
    const b = backfillForGap(db, g.to);
    const inGap = count.get(g.from, g.to) as { n: number };
    // Đồng bộ từ điện thoại phủ trọn khoảng thì chắc chắn đủ, kể cả khi lấy bù chưa rõ / có thể thiếu
    if (phoneSyncCovers(db, g.from, g.to)) return { ...g, backfill: "synced", messagesInGap: Number(inGap.n) };
    return {
      ...g,
      backfill: b.status,
      backfillItems: b.items,
      ...(b.detail ? { backfillDetail: b.detail } : {}),
      messagesInGap: Number(inGap.n),
    };
  });
}
