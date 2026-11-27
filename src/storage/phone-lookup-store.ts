import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";
import { ensureUserThread } from "./ensure-user-thread.js";

export { getLookupPause, lastLookupAttemptAt, latestFoundPhones, noZaloStreak, setLookupPause } from "./phone-lookup-streak-and-pause-store.js";

/**
 * Hàng đợi + kết quả tra số điện thoại trên Zalo (lookup_phones). Mọi hàm nhận số ĐÃ chuẩn hóa (`84` + 9 chữ số,
 * `normalizeVnPhone`). MCP chỉ xếp / hủy / đọc; vòng tra ở daemon gọi Zalo rồi ghi kết quả.
 */
export type PhoneLookupStatus = "pending" | "found" | "no_zalo" | "failed";
export type PhoneLookupRow = {
  phone: string;
  status: PhoneLookupStatus;
  userId: string | null;
  zaloName: string | null;
  resultCode: number | null;
  resultMessage: string | null;
  attempts: number;
  requestedAt: string;
  lastAttemptAt: string | null;
  checkedAt: string | null;
};
/** Người Zalo trả về khi tra ra số */
export type FoundUser = { uid: string; name: string | null; avatarUrl: string | null };

/** Điều kiện "số thuộc danh sách" truyền một mảng JSON, không phải dựng chuỗi `IN (?, ?, ...)` */
const IN_LIST = "phone IN (SELECT value FROM json_each(?))";

function toRow(r: Record<string, unknown>): PhoneLookupRow {
  return {
    phone: String(r.phone),
    status: r.status as PhoneLookupStatus,
    userId: (r.user_id as string | null) ?? null,
    zaloName: (r.zalo_name as string | null) ?? null,
    resultCode: r.result_code === null || r.result_code === undefined ? null : Number(r.result_code),
    resultMessage: (r.result_message as string | null) ?? null,
    attempts: Number(r.attempts),
    requestedAt: String(r.requested_at),
    lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
    checkedAt: (r.checked_at as string | null) ?? null,
  };
}

/** Xếp các số chưa có vào hàng đợi; số đã có (mọi trạng thái) giữ nguyên. Trả số dòng mới */
export function queuePhoneLookups(db: DatabaseSync, phones: string[], nowIso: string): number {
  const insert = db.prepare("INSERT INTO phone_lookups (phone, status, requested_at) VALUES (?, 'pending', ?) ON CONFLICT (phone) DO NOTHING");
  return inTransaction(db, () => phones.reduce((n, p) => n + Number(insert.run(p, nowIso).changes), 0));
}

/** Tra lại các số không có Zalo / lỗi (người đó có thể vừa cài Zalo, hay lần trước hỏng mạng) */
export function requeuePhoneLookups(db: DatabaseSync, phones: string[], nowIso: string): number {
  const r = db
    .prepare(
      `UPDATE phone_lookups SET status = 'pending', attempts = 0, requested_at = ?, checked_at = NULL, result_code = NULL,
         result_message = NULL WHERE status IN ('no_zalo', 'failed') AND ${IN_LIST}`,
    )
    .run(nowIso, JSON.stringify(phones));
  return Number(r.changes);
}

/** Bỏ các số còn chờ tra (đưa nhầm danh sách) để không phí lượt; số đã có kết quả giữ nguyên */
export function cancelPendingPhoneLookups(db: DatabaseSync, phones: string[]): number {
  return Number(db.prepare(`DELETE FROM phone_lookups WHERE status = 'pending' AND ${IN_LIST}`).run(JSON.stringify(phones)).changes);
}

/** Kết quả theo đúng thứ tự số đưa vào; số chưa từng xếp thì không có dòng */
export function getPhoneLookups(db: DatabaseSync, phones: string[]): PhoneLookupRow[] {
  const rows = db.prepare(`SELECT * FROM phone_lookups WHERE ${IN_LIST}`).all(JSON.stringify(phones)) as Record<string, unknown>[];
  const byPhone = new Map(rows.map((r) => [String(r.phone), toRow(r)]));
  return phones.flatMap((p) => byPhone.get(p) ?? []);
}

/** Số chờ tra lâu nhất (xếp trước tra trước) */
export function nextPendingPhoneLookup(db: DatabaseSync): PhoneLookupRow | null {
  const r = db.prepare("SELECT * FROM phone_lookups WHERE status = 'pending' ORDER BY requested_at, phone LIMIT 1").get() as
    | Record<string, unknown>
    | undefined;
  return r ? toRow(r) : null;
}

/** Giữ nhật ký lần gọi đủ để đếm trần ngày; cũ hơn thì xóa cho bảng khỏi phình */
const CALL_LOG_KEEP_MS = 3 * 86_400_000;

/** Ghi một lần gọi Zalo cho số này (trước khi gọi). Trần ngày đếm từng lần gọi ở `phone_lookup_calls` */
export function markLookupAttempt(db: DatabaseSync, phone: string, nowIso: string): void {
  inTransaction(db, () => {
    db.prepare("UPDATE phone_lookups SET attempts = attempts + 1, last_attempt_at = ? WHERE phone = ?").run(nowIso, phone);
    db.prepare("INSERT INTO phone_lookup_calls (at, phone) VALUES (?, ?)").run(nowIso, phone);
    db.prepare("DELETE FROM phone_lookup_calls WHERE at < ?").run(new Date(Date.parse(nowIso) - CALL_LOG_KEEP_MS).toISOString());
  });
}

/**
 * Tra ra người: lưu kết quả, và thêm người đó vào kho (dòng `threads` + danh bạ) để hàng đợi gửi được. Hội thoại chưa có
 * tin nên KHÔNG hiện trong danh sách hội thoại; tên đã có (bạn bè, tên đặt sẵn) không bị đè, cờ bạn bè giữ nguyên.
 */
export function markLookupFound(db: DatabaseSync, phone: string, user: FoundUser, nowIso: string): void {
  db.prepare(
    `UPDATE phone_lookups SET status = 'found', user_id = ?, zalo_name = ?, result_code = NULL, result_message = NULL,
       checked_at = ? WHERE phone = ?`,
  ).run(user.uid, user.name, nowIso, phone);
  ensureUserThread(db, user, nowIso);
}

/** Số chưa có Zalo / không cho tìm / tài khoản bị khóa: lưu mã + câu của Zalo */
export function markLookupNoZalo(db: DatabaseSync, phone: string, code: number | null, message: string, nowIso: string): void {
  db.prepare(
    `UPDATE phone_lookups SET status = 'no_zalo', user_id = NULL, zalo_name = NULL, result_code = ?, result_message = ?,
       checked_at = ? WHERE phone = ?`,
  ).run(code, message, nowIso, phone);
}

/** Lỗi mạng / hết giờ chờ: còn lượt thì để chờ tra lại, đủ `maxAttempts` lần thì thành `failed`. Trả trạng thái mới */
export function markLookupNetworkError(db: DatabaseSync, phone: string, message: string, maxAttempts: number): PhoneLookupStatus {
  const row = db.prepare("SELECT attempts FROM phone_lookups WHERE phone = ?").get(phone) as { attempts: number } | undefined;
  const status: PhoneLookupStatus = (row?.attempts ?? 0) >= maxAttempts ? "failed" : "pending";
  db.prepare("UPDATE phone_lookups SET status = ?, result_code = NULL, result_message = ? WHERE phone = ?").run(status, message, phone);
  return status;
}

/**
 * Zalo trả mã lạ cho số này (có thể đang chặn tra): ghi mã + câu, đưa số xuống cuối hàng để một số hỏng không chặn mọi số
 * phía sau; đủ `maxAttempts` lần gọi thì thành `failed`. Trả trạng thái mới
 */
export function markLookupDeferred(
  db: DatabaseSync,
  phone: string,
  code: number | null,
  message: string,
  nowIso: string,
  maxAttempts: number,
): PhoneLookupStatus {
  const row = db.prepare("SELECT attempts FROM phone_lookups WHERE phone = ?").get(phone) as { attempts: number } | undefined;
  const status: PhoneLookupStatus = (row?.attempts ?? 0) >= maxAttempts ? "failed" : "pending";
  db.prepare("UPDATE phone_lookups SET status = ?, result_code = ?, result_message = ?, requested_at = ? WHERE phone = ?").run(
    status,
    code,
    message,
    nowIso,
    phone,
  );
  return status;
}

/** Số lần đã gọi Zalo tra số kể từ mốc (mọi lần gọi, kể cả tra lại cùng một số) - cho trần ngày */
export function countLookupAttemptsSince(db: DatabaseSync, sinceIso: string): number {
  const r = db.prepare("SELECT COUNT(*) AS n FROM phone_lookup_calls WHERE at >= ?").get(sinceIso) as { n: number };
  return Number(r.n);
}

/** Đưa các số về lại chờ tra (nghi Zalo chặn tra nên kết quả "không có Zalo" vừa rồi không đáng tin) */
export function demoteToPending(db: DatabaseSync, phones: string[]): void {
  db.prepare(
    `UPDATE phone_lookups SET status = 'pending', attempts = 0, checked_at = NULL, result_code = NULL, result_message = NULL
     WHERE ${IN_LIST}`,
  ).run(JSON.stringify(phones));
}
