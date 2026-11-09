import type { DatabaseSync } from "node:sqlite";
import { DateTime } from "luxon";
import type { ThreadKind } from "../archive/archived-message-types.js";

/** Số liệu cho trang Tổng quan của dashboard. Chỉ đọc. */

export type DailyCount = { day: string; incoming: number; outgoing: number };

/**
 * Số tin vào/ra theo NGÀY của múi giờ kho, `days` ngày gần nhất (kể cả hôm nay),
 * đủ cả ngày không có tin. Gom bằng SQL với độ lệch múi giờ hiện tại - đủ đúng
 * cho múi không đổi giờ mùa hè như Asia/Ho_Chi_Minh.
 */
export function dailyMessageCounts(db: DatabaseSync, timeZone: string, days: number, now: Date): DailyCount[] {
  const local = DateTime.fromJSDate(now, { zone: timeZone });
  const offsetMinutes = local.offset;
  const firstDay = local.startOf("day").minus({ days: days - 1 });
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', sent_at, :shift) AS day,
         SUM(CASE WHEN is_self = 0 THEN 1 ELSE 0 END) AS incoming,
         SUM(CASE WHEN is_self = 1 THEN 1 ELSE 0 END) AS outgoing
       FROM messages WHERE sent_at >= :since GROUP BY day`,
    )
    .all({ shift: `${offsetMinutes >= 0 ? "+" : ""}${offsetMinutes} minutes`, since: firstDay.toUTC().toJSDate().toISOString() }) as Array<{
    day: string;
    incoming: number;
    outgoing: number;
  }>;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = firstDay.plus({ days: i }).toFormat("yyyy-LL-dd");
    const r = byDay.get(day);
    return { day, incoming: Number(r?.incoming ?? 0), outgoing: Number(r?.outgoing ?? 0) };
  });
}

export function topThreadsSince(
  db: DatabaseSync,
  sinceIso: string,
  limit: number,
): Array<{ threadId: string; threadType: ThreadKind; name: string | null; messages: number }> {
  const rows = db
    .prepare(
      `SELECT m.thread_id, m.thread_type, t.name, COUNT(*) AS n FROM messages m
       LEFT JOIN threads t ON t.thread_id = m.thread_id AND t.thread_type = m.thread_type
       WHERE m.sent_at >= ? GROUP BY m.thread_id, m.thread_type ORDER BY n DESC LIMIT ?`,
    )
    .all(sinceIso, limit) as Array<{ thread_id: string; thread_type: ThreadKind; name: string | null; n: number }>;
  return rows.map((r) => ({ threadId: r.thread_id, threadType: r.thread_type, name: r.name, messages: Number(r.n) }));
}

export function archiveTotals(db: DatabaseSync, startOfTodayIso: string) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COUNT(*) FROM threads) AS threads,
         (SELECT COUNT(*) FROM threads WHERE thread_type = 'group') AS groups,
         (SELECT COUNT(*) FROM threads WHERE thread_type = 'user' AND is_friend = 1) AS friends,
         (SELECT COUNT(*) FROM messages WHERE sent_at >= :today) AS messages_today,
         (SELECT COUNT(*) FROM messages WHERE sent_at >= :today AND is_self = 1) AS sent_today,
         (SELECT MIN(sent_at) FROM messages) AS oldest,
         (SELECT MAX(sent_at) FROM messages) AS newest`,
    )
    .get({ today: startOfTodayIso }) as Record<string, number | string | null>;
  return {
    totals: {
      messages: Number(row.messages),
      threads: Number(row.threads),
      groups: Number(row.groups),
      friends: Number(row.friends),
      messagesToday: Number(row.messages_today),
      sentByMeToday: Number(row.sent_today),
      oldestMessageAt: (row.oldest as string | null) ?? null,
      newestMessageAt: (row.newest as string | null) ?? null,
    },
  };
}

/** Đếm theo một cột của một bảng (vd nguồn tin, trạng thái hàng đợi) */
export function countBy(db: DatabaseSync, table: "messages" | "outbox" | "attachments", column: "source" | "status") {
  const rows = db.prepare(`SELECT ${column} AS k, COUNT(*) AS n FROM ${table} GROUP BY ${column}`).all() as Array<{
    k: string;
    n: number;
  }>;
  return Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
}
