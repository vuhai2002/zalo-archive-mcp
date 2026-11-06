import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Khoảng có thể thiếu tin, chờ người dùng đồng bộ từ điện thoại. Sinh ra khi nick phải đăng nhập lại bằng QR
 * (vd Zalo hủy phiên vì đổi vị trí) sau một quãng không nghe: Zalo coi phiên mới như máy mới, lượt lấy bù
 * trả 0 tin, nên tin trong quãng đó chỉ lấy lại được qua đồng bộ từ điện thoại (vd máy tắt vài giờ rồi
 * đăng nhập lại bằng QR).
 */
export type PhoneSyncSuggestion = { fromIso: string; toIso: string; createdAt: string };

const KEY = "phone_sync_suggestion";
/** Quãng ngắn hơn thì không nhắc (mất kết nối chốc lát) */
const MIN_GAP_MS = 10 * 60_000;

export function readPhoneSyncSuggestion(db: DatabaseSync): PhoneSyncSuggestion | null {
  const raw = getMeta(db, KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<PhoneSyncSuggestion>;
    return typeof s.fromIso === "string" && typeof s.toIso === "string" ? { fromIso: s.fromIso, toIso: s.toIso, createdAt: String(s.createdAt ?? s.toIso) } : null;
  } catch {
    return null;
  }
}

/** Ghi nhận quãng [fromIso, toIso] có thể thiếu tin; gộp với quãng đang chờ (nếu có). Trả true nếu có nhắc */
export function suggestPhoneSyncForGap(db: DatabaseSync, fromIso: string, toIso: string, nowIso: string): boolean {
  if (!(Date.parse(toIso) - Date.parse(fromIso) >= MIN_GAP_MS)) return false;
  const old = readPhoneSyncSuggestion(db);
  const from = old && old.fromIso < fromIso ? old.fromIso : fromIso;
  const to = old && old.toIso > toIso ? old.toIso : toIso;
  setMeta(db, KEY, JSON.stringify({ fromIso: from, toIso: to, createdAt: nowIso } satisfies PhoneSyncSuggestion));
  return true;
}

export function dismissPhoneSyncSuggestion(db: DatabaseSync): void {
  setMeta(db, KEY, "");
}

/** Lượt đồng bộ vừa xong phủ hết quãng đang chờ (0 = không giới hạn phía đó) thì thôi nhắc */
export function settlePhoneSyncSuggestion(db: DatabaseSync, range: { fromTs: number; toTs: number }): void {
  const s = readPhoneSyncSuggestion(db);
  if (!s) return;
  const coversStart = range.fromTs === 0 || range.fromTs <= Date.parse(s.fromIso);
  const coversEnd = range.toTs === 0 || range.toTs >= Date.parse(s.toIso);
  if (coversStart && coversEnd) dismissPhoneSyncSuggestion(db);
}
