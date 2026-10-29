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

/** Số nhóm / người hỏi mỗi lượt: đủ nhỏ để giống Zalo Web, không dồn dập */
const GROUP_BATCH = 50;
const CONTACT_BATCH = 50;
/** Hỏi rồi mà không ra tên/avatar thì một ngày sau mới hỏi lại */
const RETRY_MS = 24 * 3_600_000;

const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

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
      list.map((f) => ({ threadId: String(f.userId), name: nonEmpty(f.displayName) ?? nonEmpty(f.zaloName) })),
    );
    upsertContacts(
      db,
      list.map((f) => ({
        userId: String(f.userId),
        displayName: nonEmpty(f.displayName) ?? nonEmpty(f.zaloName),
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
export async function resolveMissingGroupInfo(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  const now = Date.now();
  const ids = groupsMissingName(db, GROUP_BATCH, new Date(now - RETRY_MS).toISOString());
  if (ids.length === 0) return;
  // Đánh dấu đã hỏi TRƯỚC khi gọi: hỏng hay không ra tên thì cũng chờ một ngày mới hỏi lại
  markGroupNameLookup(db, ids, new Date(now).toISOString());
  try {
    const res = await api.getGroupInfo(ids);
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
    log.warn({ err, count: ids.length }, "Không lấy được thông tin nhóm");
  }
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
        displayName: nonEmpty(m.dName) ?? nonEmpty(m.zaloName),
        avatarUrl: nonEmpty(m.avatar),
      })),
  );
  // Thành viên chưa có trong danh bạ: ghi nhận để vòng hỏi hồ sơ lấy tên + avatar
  for (const id of ids) noteContactSeen(db, id, null);
}

/** Hỏi tên + avatar cho người đã nhắn (người lạ, thành viên nhóm) mà kho chưa có avatar */
export async function resolveUnknownContacts(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  const now = Date.now();
  const ids = contactsNeedingLookup(db, CONTACT_BATCH, new Date(now - RETRY_MS).toISOString());
  if (ids.length === 0) return;
  markContactLookup(db, ids, new Date(now).toISOString());
  try {
    const res = await api.getUserInfo(ids);
    // Khóa trả về dạng "<uid>_0"; lấy uid từ chính hồ sơ cho chắc
    const entries = Object.entries(res.changed_profiles ?? {}).map(([key, p]) => ({
      userId: nonEmpty(p?.userId) ?? key.replace(/_\d+$/, ""),
      displayName: nonEmpty(p?.displayName) ?? nonEmpty(p?.zaloName),
      avatarUrl: nonEmpty(p?.avatar),
    }));
    upsertContacts(db, entries);
    log.info({ asked: ids.length, found: entries.length }, "Đã cập nhật hồ sơ người nhắn");
  } catch (err) {
    log.warn({ err, count: ids.length }, "Không lấy được hồ sơ người nhắn");
  }
}
