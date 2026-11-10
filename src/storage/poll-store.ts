import type { DatabaseSync } from "node:sqlite";

/**
 * Bình chọn nhóm trong kho (chỉ xem, không bình chọn): `poll_activity` = cuộc bình chọn nào vừa có tin `group.poll` (tạo,
 * tham gia, đổi lựa chọn, khóa...), `poll_snapshots` = chi tiết daemon lấy từ Zalo (getPollDetail). Daemon hỏi lại một cuộc khi
 * có hoạt động mới hơn lần lấy trước, nhưng chờ các lượt liền nhau lắng xuống và không hỏi một cuộc quá dày.
 */
export const POLL_SETTLE_MS = 20_000;
export const POLL_MIN_INTERVAL_MS = 60_000;
export const POLL_ERROR_RETRY_MS = 6 * 60 * 60_000;

export type PollSnapshot = { detailJson: string | null; fetchedAt: string; error: string | null };
export type PollActivity = { groupId: string; question: string | null; lastEventAt: string };

/** Ghi một hoạt động bình chọn (tin group.poll); mốc hoạt động chỉ tiến lên, câu hỏi giữ bản mới nhất có chữ */
export function notePollActivity(db: DatabaseSync, a: { pollId: string; groupId: string; question: string; at: string }): void {
  db.prepare(
    `INSERT INTO poll_activity (poll_id, group_id, question, last_event_at) VALUES (:pollId, :groupId, :question, :at)
     ON CONFLICT (poll_id) DO UPDATE SET
       last_event_at = MAX(last_event_at, excluded.last_event_at),
       question = COALESCE(NULLIF(excluded.question, ''), question)`,
  ).run({ pollId: a.pollId, groupId: a.groupId, question: a.question, at: a.at });
}

/** Cuộc bình chọn cần hỏi Zalo kế tiếp (hoạt động mới nhất trước), hoặc null */
export function nextPollDue(db: DatabaseSync, now: Date): string | null {
  const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const row = db
    .prepare(
      `SELECT a.poll_id FROM poll_activity a LEFT JOIN poll_snapshots s ON s.poll_id = a.poll_id
       WHERE a.last_event_at <= :settled
         AND (s.poll_id IS NULL
           OR (s.fetched_at < a.last_event_at AND s.fetched_at <= :minInterval)
           OR (s.error IS NOT NULL AND s.fetched_at <= :errorRetry))
       ORDER BY a.last_event_at DESC LIMIT 1`,
    )
    .get({ settled: iso(POLL_SETTLE_MS), minInterval: iso(POLL_MIN_INTERVAL_MS), errorRetry: iso(POLL_ERROR_RETRY_MS) }) as
    | { poll_id: string }
    | undefined;
  return row?.poll_id ?? null;
}

/** Lưu kết quả một lần hỏi: chi tiết (lỗi thì giữ chi tiết cũ, chỉ ghi lỗi + giờ hỏi) */
export function savePollSnapshot(db: DatabaseSync, pollId: string, r: { detailJson: string | null; error: string | null; fetchedAt: string }): void {
  db.prepare(
    `INSERT INTO poll_snapshots (poll_id, detail_json, fetched_at, error) VALUES (:pollId, :detailJson, :fetchedAt, :error)
     ON CONFLICT (poll_id) DO UPDATE SET
       detail_json = COALESCE(excluded.detail_json, detail_json), fetched_at = excluded.fetched_at, error = excluded.error`,
  ).run({ pollId, detailJson: r.detailJson, fetchedAt: r.fetchedAt, error: r.error });
}

export function getPollSnapshot(db: DatabaseSync, pollId: string): PollSnapshot | null {
  const row = db.prepare("SELECT detail_json, fetched_at, error FROM poll_snapshots WHERE poll_id = ?").get(pollId) as
    | { detail_json: string | null; fetched_at: string; error: string | null }
    | undefined;
  return row ? { detailJson: row.detail_json, fetchedAt: row.fetched_at, error: row.error } : null;
}

export function getPollActivity(db: DatabaseSync, pollId: string): PollActivity | null {
  const row = db.prepare("SELECT group_id, question, last_event_at FROM poll_activity WHERE poll_id = ?").get(pollId) as
    | { group_id: string; question: string | null; last_event_at: string }
    | undefined;
  return row ? { groupId: row.group_id, question: row.question, lastEventAt: row.last_event_at } : null;
}
