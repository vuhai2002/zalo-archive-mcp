import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { resolveMissingGroupInfo, resolveUnknownContacts, syncFriendDirectory } from "../zalo/contact-directory-sync.js";
import { resolveStickerImages } from "../zalo/sticker-image-resolver.js";

const LOOKUP_INTERVAL_MS = 20_000;
const FIRST_RUN_DELAY_MS = 5_000;
const FRIEND_SYNC_DEBOUNCE_MS = 5_000;

/**
 * Vòng hỏi Zalo những thứ tin nhắn không mang theo: tên + avatar nhóm, hồ sơ người
 * nhắn, ảnh sticker, danh sách bạn bè. Mỗi lượt chỉ gọi API khi THẬT SỰ có thứ
 * còn thiếu (các truy vấn "còn thiếu gì" rẻ), nên chạy dày được: nhóm mới / sticker
 * mới hiện đủ sau vài chục giây thay vì chờ lâu.
 *
 * Các bước chạy NỐI TIẾP, lượt sau không chồng lượt trước.
 */
export function startDirectoryLookupLoop(o: {
  api: API;
  db: DatabaseSync;
  log: Logger;
  friendSyncEveryMs: number;
}): { stop: () => void; requestFriendSync: () => void } {
  let stopped = false;
  let running = false;
  let friendSyncDue = true;
  let lastFriendSync = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const runOnce = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const periodic = o.friendSyncEveryMs > 0 && Date.now() - lastFriendSync > o.friendSyncEveryMs;
      if (friendSyncDue || periodic) {
        friendSyncDue = false;
        lastFriendSync = Date.now();
        await syncFriendDirectory(o.api, o.db, o.log);
      }
      await resolveMissingGroupInfo(o.api, o.db, o.log);
      await resolveUnknownContacts(o.api, o.db, o.log);
      await resolveStickerImages(o.api, o.db, o.log);
    } catch (err) {
      o.log.warn({ err }, "Vòng hỏi danh bạ gặp lỗi");
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void runOnce(), LOOKUP_INTERVAL_MS);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      if (debounce) clearTimeout(debounce);
    },
    // Kết bạn / hủy kết bạn: đồng bộ lại danh sách sau vài giây (gộp nhiều sự kiện liền nhau)
    requestFriendSync: () => {
      friendSyncDue = true;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void runOnce(), FRIEND_SYNC_DEBOUNCE_MS);
    },
  };
}
