import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Zalo báo hỏi quá nhiều (mã 221) thì vòng hỏi danh bạ nghỉ một lúc, bị lại thì nghỉ lâu hơn. Ghi
 * vào `meta` để chạy lại daemon (cập nhật code, khởi động lại máy) vẫn nghỉ tiếp - nếu chỉ giữ
 * trong bộ nhớ, mỗi lần chạy lại là hỏi Zalo ngay và lại bị chặn.
 */
export type LookupPause = { untilMs: number; times: number };

const KEY = "directory_lookup_pause";

export function readLookupPause(db: DatabaseSync): LookupPause {
  try {
    const v = JSON.parse(getMeta(db, KEY) ?? "null") as { untilMs?: unknown; times?: unknown } | null;
    const untilMs = Number(v?.untilMs);
    const times = Number(v?.times);
    return { untilMs: Number.isFinite(untilMs) ? untilMs : 0, times: Number.isInteger(times) && times > 0 ? times : 0 };
  } catch {
    return { untilMs: 0, times: 0 };
  }
}

export function saveLookupPause(db: DatabaseSync, p: LookupPause): void {
  setMeta(db, KEY, JSON.stringify(p));
}
