import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import {
  rateLimitPauseMs,
  resolveMissingGroupInfo,
  resolveUnknownContacts,
  syncFriendDirectory,
} from "../zalo/contact-directory-sync.js";
import { readLookupPause, saveLookupPause } from "../storage/directory-lookup-pause-store.js";
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
 * Hồ sơ người nhắn hỏi thưa hơn (`contactLookupGapMs` giữa hai lượt): sau khi đồng bộ từ
 * điện thoại có thể có vài trăm người cần hỏi. Zalo báo hỏi quá nhiều (mã 221) thì nghỉ cả
 * vòng `rateLimitPauseMs`, bị lại thì gấp đôi, hỏi được một lượt thì về mức đầu. Thời gian nghỉ lưu
 * trong DB (`directory-lookup-pause-store.ts`) để chạy lại daemon không phá lệ nghỉ.
 *
 * Các bước chạy NỐI TIẾP, lượt sau không chồng lượt trước.
 */
export function startDirectoryLookupLoop(o: {
  api: API;
  db: DatabaseSync;
  log: Logger;
  friendSyncEveryMs: number;
  contactLookupGapMs: number;
  rateLimitPauseMs: number;
}): { stop: () => void; requestFriendSync: () => void } {
  let stopped = false;
  let running = false;
  let friendSyncDue = true;
  let lastFriendSync = 0;
  let lastContactLookup = 0;
  // Nghỉ do Zalo chặn được lưu trong DB: chạy lại daemon vẫn nghỉ tiếp, không hỏi ngay
  let { untilMs: pausedUntil, times: rateLimitedTimes } = readLookupPause(o.db);
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const pause = () => {
    const ms = rateLimitPauseMs(rateLimitedTimes++, o.rateLimitPauseMs);
    pausedUntil = Date.now() + ms;
    saveLookupPause(o.db, { untilMs: pausedUntil, times: rateLimitedTimes });
    o.log.warn({ minutes: Math.round(ms / 60_000) }, "Zalo báo hỏi quá nhiều - tạm nghỉ hỏi danh bạ");
  };

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
      // Đang nghỉ vì Zalo chặn: danh sách bạn bè (lượt khác, không bị chặn) vẫn đồng bộ, phần hỏi còn lại chờ
      if (Date.now() < pausedUntil) return;
      const groups = await resolveMissingGroupInfo(o.api, o.db, o.log);
      if (groups === "rate_limited") return pause();
      if (Date.now() - lastContactLookup >= o.contactLookupGapMs) {
        const contacts = await resolveUnknownContacts(o.api, o.db, o.log);
        if (contacts === "rate_limited") return pause();
        if (contacts === "done") lastContactLookup = Date.now();
        if ((contacts === "done" || groups === "done") && rateLimitedTimes > 0) {
          rateLimitedTimes = 0;
          saveLookupPause(o.db, { untilMs: 0, times: 0 });
        }
      }
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
