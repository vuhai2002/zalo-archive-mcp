import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import {
  rateLimitPauseMs,
  resolveMissingGroupInfo,
  resolveUnknownContacts,
  syncFriendDirectory,
} from "../zalo/contact-directory-sync.js";
import { type LookupKind, type LookupPause, readLookupPause, saveLookupPause } from "../storage/directory-lookup-pause-store.js";
import { syncContactAliases } from "../zalo/contact-alias-sync.js";
import { resolveStickerImages } from "../zalo/sticker-image-resolver.js";

const LOOKUP_INTERVAL_MS = 20_000;
const FIRST_RUN_DELAY_MS = 5_000;
const FRIEND_SYNC_DEBOUNCE_MS = 5_000;
const KIND_LABEL: Record<LookupKind, string> = { groups: "hỏi thông tin nhóm", contacts: "hỏi hồ sơ người nhắn" };

/**
 * Vòng hỏi Zalo những thứ tin nhắn không mang theo: tên + avatar nhóm, hồ sơ người
 * nhắn, ảnh sticker, danh sách bạn bè + tên gợi nhớ. Mỗi lượt chỉ gọi API khi THẬT SỰ có thứ
 * còn thiếu (các truy vấn "còn thiếu gì" rẻ), nên chạy dày được: nhóm mới / sticker
 * mới hiện đủ sau vài chục giây thay vì chờ lâu.
 *
 * Hồ sơ người nhắn hỏi thưa hơn (`contactLookupGapMs` giữa hai lượt): sau khi đồng bộ từ
 * điện thoại có thể có vài trăm người cần hỏi. Zalo báo hỏi quá nhiều (mã 221) thì loại hỏi bị
 * chặn nghỉ `rateLimitPauseMs`, bị lại thì gấp đôi, hỏi được một lượt thì về mức đầu. Hỏi nhóm và
 * hỏi hồ sơ nghỉ RIÊNG: lệnh hỏi hồ sơ bị chặn cả ngày không được kéo nhóm mới phải chờ theo. Thời
 * gian nghỉ lưu trong DB (`directory-lookup-pause-store.ts`) để chạy lại daemon không phá lệ nghỉ.
 * Danh sách bạn bè và ảnh sticker không thuộc lệnh bị chặn nên vẫn chạy trong lúc nghỉ. Mất mạng (máy vừa bật,
 * chưa có mạng) không tính là đã hỏi: nhóm hỏi lại ở lượt sau, hồ sơ hỏi lại sau `contactLookupGapMs`.
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
  const pauses: Record<LookupKind, LookupPause> = {
    groups: readLookupPause(o.db, "groups"),
    contacts: readLookupPause(o.db, "contacts"),
  };
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const paused = (kind: LookupKind) => Date.now() < pauses[kind].untilMs;
  const setPause = (kind: LookupKind, p: LookupPause) => {
    pauses[kind] = p;
    saveLookupPause(o.db, kind, p);
  };
  const pause = (kind: LookupKind) => {
    const { times } = pauses[kind];
    const ms = rateLimitPauseMs(times, o.rateLimitPauseMs);
    setPause(kind, { untilMs: Date.now() + ms, times: times + 1 });
    o.log.warn({ minutes: Math.round(ms / 60_000), lookup: kind }, `Zalo báo hỏi quá nhiều - tạm nghỉ ${KIND_LABEL[kind]}`);
  };
  // Hỏi được một lượt: lần bị chặn sau lại nghỉ từ mức đầu
  const recovered = (kind: LookupKind) => {
    if (pauses[kind].times > 0) setPause(kind, { untilMs: 0, times: 0 });
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
        await syncContactAliases(o.api, o.db, o.log);
      }
      // Ảnh sticker dùng lệnh riêng (không phải lệnh hỏi hồ sơ bị chặn), sticker đã biết ảnh thì
      // gắn ngay không gọi Zalo - nên không chờ giờ nghỉ, kẻo tin sticker mới chỉ hiện "[sticker]"
      await resolveStickerImages(o.api, o.db, o.log);
      // Loại hỏi đang nghỉ vì Zalo chặn thì chờ; danh sách bạn bè (lượt khác, không bị chặn) vẫn đồng bộ
      if (!paused("groups")) {
        const groups = await resolveMissingGroupInfo(o.api, o.db, o.log);
        if (groups === "rate_limited") pause("groups");
        else if (groups === "done") recovered("groups");
      }
      if (!paused("contacts") && Date.now() - lastContactLookup >= o.contactLookupGapMs) {
        const contacts = await resolveUnknownContacts(o.api, o.db, o.log);
        if (contacts === "rate_limited") pause("contacts");
        else if (contacts !== "idle") {
          // Mất mạng cũng chờ đủ khoảng giãn rồi mới thử lại, nhưng không tính là Zalo đã thôi chặn
          lastContactLookup = Date.now();
          if (contacts === "done") recovered("contacts");
        }
      }
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
