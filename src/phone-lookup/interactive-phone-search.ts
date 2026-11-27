import type { DatabaseSync } from "node:sqlite";
import {
  cancelPendingPhoneLookups,
  getLookupPause,
  getPhoneLookups,
  markLookupAttempt,
  markLookupFound,
  markLookupNoZalo,
  queuePhoneLookups,
  requeuePhoneLookups,
} from "../storage/phone-lookup-store.js";
import type { PhoneLookupFn } from "./phone-lookup-loop.js";
import { classifyLookupError } from "./phone-lookup-rules.js";

/**
 * Gõ số điện thoại vào ô Tìm kiếm của dashboard, như ô Tìm kiếm của Zalo PC: số kho đã tra ra thì trả ngay; chưa thì hỏi
 * Zalo MỘT lần (cùng đường tra với `lookup_phones`, ghi chung bảng `phone_lookups`, tính vào số lần tra trong ngày). Tra ra
 * người thì người đó có dòng hội thoại trong kho (mở được để nhắn), dù chưa có tin.
 *
 * Khác vòng tra của lookup_phones: người dùng tự gõ từng số nên không chờ nhịp / khung giờ / trần ngày; vẫn dừng khi Zalo
 * đang bị nghi chặn tra (tạm dừng do vòng tra đặt). Lỗi lạ không đặt tạm dừng cho cả vòng (một lần gõ không đủ để kết luận).
 */
export type FoundPhoneUser = { uid: string; name: string | null; avatarUrl: string | null; isFriend: boolean; hasMessages: boolean };
export type PhoneSearchResult =
  | { status: "found"; user: FoundPhoneUser; fromCache: boolean }
  | { status: "no_zalo" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

/** Số đã tra là "không có Zalo" trong chừng này thì không hỏi lại (người đó có thể vừa cài Zalo nên không giữ mãi) */
const NO_ZALO_FRESH_MS = 24 * 60 * 60_000;

function foundUser(db: DatabaseSync, uid: string, zaloName: string | null): FoundPhoneUser {
  const c = db.prepare("SELECT display_name, alias, avatar_url FROM contacts WHERE user_id = ?").get(uid) as
    | { display_name: string | null; alias: string | null; avatar_url: string | null }
    | undefined;
  const t = db.prepare("SELECT name, is_friend FROM threads WHERE thread_id = ? AND thread_type = 'user'").get(uid) as
    | { name: string | null; is_friend: number }
    | undefined;
  const hasMessages = !!db.prepare("SELECT 1 FROM messages WHERE thread_id = ? AND thread_type = 'user' LIMIT 1").get(uid);
  return {
    uid,
    name: c?.alias ?? t?.name ?? c?.display_name ?? zaloName,
    avatarUrl: c?.avatar_url ?? null,
    isFriend: t?.is_friend === 1,
    hasMessages,
  };
}

export async function searchPhoneInteractive(
  db: DatabaseSync,
  phone84: string,
  live: { lookup: PhoneLookupFn | null; blockedReason: string | null },
  now: Date = new Date(),
): Promise<PhoneSearchResult> {
  const known = getPhoneLookups(db, [phone84])[0];
  if (known?.status === "found" && known.userId) return { status: "found", user: foundUser(db, known.userId, known.zaloName), fromCache: true };
  if (known?.status === "no_zalo" && known.checkedAt && now.getTime() - Date.parse(known.checkedAt) < NO_ZALO_FRESH_MS) return { status: "no_zalo" };

  if (live.blockedReason) return { status: "unavailable", message: live.blockedReason };
  if (!live.lookup) return { status: "unavailable", message: "Nick chưa chạy nên chưa tra được trên Zalo" };
  const pause = getLookupPause(db);
  if (pause && Date.parse(pause.until) > now.getTime()) return { status: "unavailable", message: `Tạm dừng tra số: ${pause.reason}` };

  const iso = now.toISOString();
  // Dòng do lần gõ này tạo thì tra hỏng phải gỡ đi, kẻo vòng tra của lookup_phones tự tra lại sau
  const createdHere = !known;
  if (createdHere) queuePhoneLookups(db, [phone84], iso);
  else if (known.status !== "pending") requeuePhoneLookups(db, [phone84], iso);
  markLookupAttempt(db, phone84, iso);
  const fail = (message: string): PhoneSearchResult => {
    if (createdHere) cancelPendingPhoneLookups(db, [phone84]);
    return { status: "error", message };
  };
  try {
    const outcome = await live.lookup(phone84);
    if (outcome.kind === "found") {
      markLookupFound(db, phone84, outcome.user, iso);
      return { status: "found", user: foundUser(db, outcome.user.uid, outcome.user.name), fromCache: false };
    }
    if (classifyLookupError(outcome.code) === "no_zalo") {
      markLookupNoZalo(db, phone84, outcome.code, outcome.message, iso);
      return { status: "no_zalo" };
    }
    return fail(`Zalo trả mã ${outcome.code ?? "không rõ"}: ${outcome.message}`);
  } catch (err) {
    return fail(`Không hỏi được Zalo: ${err instanceof Error ? err.message : String(err)}`);
  }
}
