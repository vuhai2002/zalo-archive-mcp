import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Hai thứ vòng tra số cần để không ghi nhầm "không có Zalo" khi thật ra Zalo đang chặn tra: chuỗi kết quả "không có Zalo"
 * liền nhau mới nhất (kèm số mốc đã biết là có Zalo để tra lại), và trạng thái tạm dừng tra (lưu trong `meta`).
 */
const PAUSE_KEY = "phone_lookup_pause";
/** Chỉ cần biết chuỗi có từ 10 số trở lên; đọc dư một chút */
const STREAK_SCAN_LIMIT = 50;

/** Các số "không có Zalo" liền nhau mới nhất (theo giờ tra), dừng ở số có Zalo gần nhất. Mới nhất trước */
export function noZaloStreak(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT phone, status FROM phone_lookups WHERE checked_at IS NOT NULL ORDER BY checked_at DESC, phone DESC LIMIT ?")
    .all(STREAK_SCAN_LIMIT) as Array<{ phone: string; status: string }>;
  const streak: string[] = [];
  for (const r of rows) {
    if (r.status !== "no_zalo") break;
    streak.push(r.phone);
  }
  return streak;
}

/** Các số có Zalo tra ra gần nhất, mới nhất trước - dùng làm số mốc */
export function latestFoundPhones(db: DatabaseSync, limit: number): string[] {
  const rows = db.prepare("SELECT phone FROM phone_lookups WHERE status = 'found' ORDER BY checked_at DESC, phone DESC LIMIT ?").all(limit) as Array<{
    phone: string;
  }>;
  return rows.map((r) => r.phone);
}

/** Lần gọi Zalo tra số gần nhất (mọi số) - cho nhịp giữa hai lượt, đọc từ DB nên giữ được qua lần khởi động lại */
export function lastLookupAttemptAt(db: DatabaseSync): string | null {
  const r = db.prepare("SELECT MAX(at) AS at FROM phone_lookup_calls").get() as { at: string | null };
  return r.at ?? null;
}

export type LookupPause = { until: string; reason: string };

/** Đang tạm dừng tra tới đâu và vì sao; chưa từng dừng hoặc dữ liệu hỏng thì null */
export function getLookupPause(db: DatabaseSync): LookupPause | null {
  const raw = getMeta(db, PAUSE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LookupPause>;
    return typeof p.until === "string" && typeof p.reason === "string" ? { until: p.until, reason: p.reason } : null;
  } catch {
    return null;
  }
}

export function setLookupPause(db: DatabaseSync, untilIso: string, reason: string): void {
  setMeta(db, PAUSE_KEY, JSON.stringify({ until: untilIso, reason }));
}
