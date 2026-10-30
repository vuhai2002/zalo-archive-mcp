import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Zalo báo hỏi quá nhiều (mã 221) thì vòng hỏi danh bạ nghỉ một lúc, bị lại thì nghỉ lâu hơn. Ghi
 * vào `meta` để chạy lại daemon (cập nhật code, khởi động lại máy) vẫn nghỉ tiếp - nếu chỉ giữ
 * trong bộ nhớ, mỗi lần chạy lại là hỏi Zalo ngay và lại bị chặn.
 *
 * Mỗi loại hỏi nghỉ riêng: Zalo chặn lệnh hỏi hồ sơ người (sau đồng bộ điện thoại có cả nghìn người
 * cần hỏi) không có nghĩa lệnh hỏi thông tin nhóm cũng bị chặn, nên nhóm mới không phải chờ theo.
 */
export type LookupPause = { untilMs: number; times: number };
export type LookupKind = "groups" | "contacts";

// Khóa cũ (trước khi tách) giữ cho hỏi hồ sơ: lệnh bị chặn trên thực tế là lệnh hỏi hồ sơ
const KEYS: Record<LookupKind, string> = {
  contacts: "directory_lookup_pause",
  groups: "directory_lookup_pause_groups",
};

export function readLookupPause(db: DatabaseSync, kind: LookupKind): LookupPause {
  try {
    const v = JSON.parse(getMeta(db, KEYS[kind]) ?? "null") as { untilMs?: unknown; times?: unknown } | null;
    const untilMs = Number(v?.untilMs);
    const times = Number(v?.times);
    return { untilMs: Number.isFinite(untilMs) ? untilMs : 0, times: Number.isInteger(times) && times > 0 ? times : 0 };
  } catch {
    return { untilMs: 0, times: 0 };
  }
}

export function saveLookupPause(db: DatabaseSync, kind: LookupKind, p: LookupPause): void {
  setMeta(db, KEYS[kind], JSON.stringify(p));
}
