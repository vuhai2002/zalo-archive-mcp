import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import {
  groupsMissingName,
  markGroupNameLookup,
  replaceFriendDirectory,
  upsertGroupNames,
} from "../storage/thread-directory-store.js";

/** Số nhóm hỏi tên mỗi lượt: đủ nhỏ để giống Zalo Web, không dồn dập */
const GROUP_NAME_BATCH = 50;
/** Nhóm hỏi rồi mà không ra tên thì một ngày sau mới hỏi lại */
const GROUP_NAME_RETRY_MS = 24 * 3_600_000;

/**
 * Lấy danh sách bạn bè (tên danh bạ + cờ bạn bè cho cổng gửi). Một lời gọi,
 * giống Zalo Web làm lúc mở.
 */
export async function syncFriendDirectory(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  try {
    const friends = await api.getAllFriends();
    const entries = (Array.isArray(friends) ? friends : []).map((f) => ({
      threadId: String(f.userId),
      name: f.displayName || f.zaloName || null,
    }));
    const n = replaceFriendDirectory(db, entries);
    log.info({ friends: n }, "Đã đồng bộ danh sách bạn bè");
  } catch (err) {
    log.warn({ err }, "Không lấy được danh sách bạn bè (giữ dữ liệu cũ)");
  }
}

/**
 * Hỏi tên cho các nhóm ĐÃ có tin trong kho mà chưa biết tên. Không quét mọi
 * nhóm của tài khoản: chỉ nhóm thật sự có hoạt động mới cần tên.
 */
export async function resolveMissingGroupNames(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  const now = Date.now();
  const ids = groupsMissingName(db, GROUP_NAME_BATCH, new Date(now - GROUP_NAME_RETRY_MS).toISOString());
  if (ids.length === 0) return;
  // Đánh dấu đã hỏi TRƯỚC khi gọi: hỏng hay không ra tên thì cũng chờ một ngày mới hỏi lại
  markGroupNameLookup(db, ids, new Date(now).toISOString());
  try {
    const res = await api.getGroupInfo(ids);
    const groups = Object.entries(res.gridInfoMap ?? {}).map(([id, info]) => ({
      threadId: id,
      name: info?.name || null,
    }));
    upsertGroupNames(db, groups);
    log.info({ asked: ids.length, named: groups.length }, "Đã cập nhật tên nhóm");
  } catch (err) {
    log.warn({ err, count: ids.length }, "Không lấy được tên nhóm");
  }
}
