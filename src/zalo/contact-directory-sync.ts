import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { contactsNeedingLookup, markContactLookup, noteContactSeen, upsertContacts } from "../storage/contact-store.js";
import { replaceGroupMembers } from "../storage/group-member-store.js";
import {
  groupsMissingName,
  markGroupNameLookup,
  replaceFriendDirectory,
  upsertGroupNames,
} from "../storage/thread-directory-store.js";
import { isNetworkFailure } from "./listener-error-details.js";

/** Số nhóm / người hỏi mỗi lượt: đủ nhỏ để giống Zalo Web, không dồn dập */
const GROUP_BATCH = 50;
const CONTACT_BATCH = 50;
/** Hỏi rồi mà Zalo không trả (hồ sơ / nhóm) thì một ngày sau mới hỏi lại, tổng cộng tối đa MAX_LOOKUP_ATTEMPTS lần */
const RETRY_MS = 24 * 3_600_000;
/** Mã lỗi Zalo "Vượt quá số request cho phép" */
const ZALO_RATE_LIMIT_CODE = 221;
const MAX_RATE_LIMIT_PAUSE_MS = 6 * 3_600_000;

/**
 * Kết quả một lượt hỏi: không có gì để hỏi / đã hỏi (được, hay Zalo trả lỗi) / Zalo báo hỏi quá nhiều / mất mạng
 * (chưa tới được Zalo, vd máy vừa bật chưa có mạng - không tính là đã hỏi, lượt sau hỏi lại)
 */
export type LookupOutcome = "idle" | "done" | "rate_limited" | "offline";

export function isZaloRateLimit(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === ZALO_RATE_LIMIT_CODE;
}

/** Bị Zalo chặn lần thứ `times` liên tiếp (tính từ 0): nghỉ gấp đôi mỗi lần, tối đa 6 tiếng */
export function rateLimitPauseMs(times: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(0, times), MAX_RATE_LIMIT_PAUSE_MS);
}

const errorMessage = (err: unknown): string => String((err as { message?: unknown } | null)?.message ?? err);
const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Tên một người như Zalo PC hiện (khi mình chưa đặt tên gợi nhớ - tên gợi nhớ đè lên lúc đọc): tên Zalo người đó tự đặt
 * (`zaloName`). `displayName` / `dName` Zalo trả theo phía mình - có thể là tên lưu trong danh bạ điện thoại (vd "Chị A (bạn cũ)"
 * trong khi Zalo PC hiện "Thư Khúc") - chỉ dùng khi thiếu tên Zalo.
 */
export const personName = (p: { zaloName?: unknown; displayName?: unknown; dName?: unknown } | null | undefined): string | null =>
  nonEmpty(p?.zaloName) ?? nonEmpty(p?.displayName) ?? nonEmpty(p?.dName);

/**
 * Lấy danh sách bạn bè (tên, avatar, cờ bạn bè cho cổng gửi). Một lời gọi, giống
 * Zalo Web làm lúc mở.
 */
export async function syncFriendDirectory(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  try {
    const friends = await api.getAllFriends();
    const list = Array.isArray(friends) ? friends : [];
    const n = replaceFriendDirectory(
      db,
      list.map((f) => ({ threadId: String(f.userId), name: personName(f) })),
    );
    upsertContacts(
      db,
      list.map((f) => ({
        userId: String(f.userId),
        displayName: personName(f),
        avatarUrl: nonEmpty(f.avatar),
      })),
    );
    log.info({ friends: n }, "Đã đồng bộ danh sách bạn bè");
  } catch (err) {
    log.warn({ err }, "Không lấy được danh sách bạn bè (giữ dữ liệu cũ)");
  }
}

/**
 * Hỏi tên + avatar cho các nhóm ĐÃ có tin trong kho mà còn thiếu. Không quét mọi
 * nhóm của tài khoản: chỉ nhóm thật sự có hoạt động mới cần.
 */
export async function resolveMissingGroupInfo(api: API, db: DatabaseSync, log: Logger): Promise<LookupOutcome> {
  const now = Date.now();
  const ids = groupsMissingName(db, GROUP_BATCH, new Date(now - RETRY_MS).toISOString());
  if (ids.length === 0) return "idle";
  try {
    const res = await api.getGroupInfo(ids);
    // Hỏi được thì dù không ra tên cũng chờ một ngày mới hỏi lại
    markGroupNameLookup(db, ids, new Date(now).toISOString());
    const entries = Object.entries(res.gridInfoMap ?? {});
    upsertGroupNames(
      db,
      entries.map(([id, info]) => ({
        threadId: id,
        name: nonEmpty(info?.name),
        avatarUrl: nonEmpty(info?.fullAvt) ?? nonEmpty(info?.avt),
      })),
    );
    for (const [id, info] of entries) storeGroupMembers(db, id, info);
    log.info({ asked: ids.length, found: entries.length }, "Đã cập nhật tên, avatar, thành viên nhóm");
  } catch (err) {
    // Zalo báo hỏi quá nhiều: không tính là đã hỏi, vòng hỏi tạm nghỉ rồi hỏi lại. Mất mạng: cũng không tính
    if (isZaloRateLimit(err)) return "rate_limited";
    if (isNetworkFailure(err)) {
      log.warn({ count: ids.length, error: errorMessage(err) }, "Chưa có mạng - chưa hỏi được thông tin nhóm, hỏi lại lượt sau");
      return "offline";
    }
    markGroupNameLookup(db, ids, new Date(now).toISOString());
    log.warn({ err, count: ids.length }, "Không lấy được thông tin nhóm");
  }
  return "done";
}

/**
 * Thành viên nhóm. Zalo thường để trống `memberIds` và `currentMems`, danh sách thật
 * nằm ở `memVerList` dạng "<uid>_<phiên bản>" (mảng, hoặc object có khóa như vậy) -
 * đọc lần lượt cả ba nguồn như deplao. Có `currentMems` thì lấy luôn tên + avatar;
 * không có thì người đó vào danh bạ để vòng hỏi hồ sơ lấy sau.
 */
function storeGroupMembers(db: DatabaseSync, groupId: string, info: unknown): void {
  const g = info as { memberIds?: unknown; currentMems?: unknown; memVerList?: unknown; totalMember?: unknown } | null;
  const mems = Array.isArray(g?.currentMems) ? (g.currentMems as Array<Record<string, unknown>>) : [];
  const memVer = Array.isArray(g?.memVerList)
    ? (g.memVerList as unknown[])
    : g?.memVerList && typeof g.memVerList === "object"
      ? Object.keys(g.memVerList)
      : [];
  const raw: unknown[] =
    Array.isArray(g?.memberIds) && g.memberIds.length > 0 ? g.memberIds : mems.length > 0 ? mems.map((m) => m.id) : memVer;
  const ids = [...new Set(raw.map((x) => String(x ?? "").trim().replace(/_\d+$/, "")).filter((id) => /^\d+$/.test(id)))];
  if (ids.length === 0) return;
  const total = typeof g?.totalMember === "number" ? g.totalMember : null;
  replaceGroupMembers(db, groupId, ids, total);
  upsertContacts(
    db,
    mems
      .filter((m) => m.id)
      .map((m) => ({
        userId: String(m.id),
        displayName: personName(m),
        avatarUrl: nonEmpty(m.avatar),
      })),
  );
  // Thành viên chưa có trong danh bạ: ghi nhận để vòng hỏi hồ sơ lấy tên + avatar
  for (const id of ids) noteContactSeen(db, id, null);
}

/** Hỏi tên + avatar cho người đã nhắn (người lạ, thành viên nhóm) mà kho chưa có avatar */
export async function resolveUnknownContacts(api: API, db: DatabaseSync, log: Logger): Promise<LookupOutcome> {
  const now = Date.now();
  const ids = contactsNeedingLookup(db, CONTACT_BATCH, new Date(now - RETRY_MS).toISOString());
  if (ids.length === 0) return "idle";
  try {
    const res = await api.getUserInfo(ids);
    markContactLookup(db, ids, new Date(now).toISOString());
    // Khóa trả về dạng "<uid>_0"; lấy uid từ chính hồ sơ cho chắc
    const entries = Object.entries(res.changed_profiles ?? {}).map(([key, p]) => ({
      userId: nonEmpty(p?.userId) ?? key.replace(/_\d+$/, ""),
      displayName: personName(p),
      avatarUrl: nonEmpty(p?.avatar),
    }));
    upsertContacts(db, entries);
    log.info({ asked: ids.length, found: entries.length }, "Đã cập nhật hồ sơ người nhắn");
  } catch (err) {
    // Zalo báo hỏi quá nhiều: không tính là đã hỏi, vòng hỏi tạm nghỉ rồi hỏi lại. Mất mạng: cũng không tính
    if (isZaloRateLimit(err)) return "rate_limited";
    if (isNetworkFailure(err)) {
      log.warn({ count: ids.length, error: errorMessage(err) }, "Chưa có mạng - chưa hỏi được hồ sơ người nhắn, hỏi lại lượt sau");
      return "offline";
    }
    markContactLookup(db, ids, new Date(now).toISOString());
    log.warn({ err, count: ids.length }, "Không lấy được hồ sơ người nhắn");
  }
  return "done";
}
