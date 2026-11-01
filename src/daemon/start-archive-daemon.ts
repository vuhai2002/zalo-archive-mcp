import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { ThreadType, type API } from "zca-js";
import type { AccountPaths } from "../config/account-paths.js";
import type { AppEnv } from "../config/env-schema.js";
import { MediaDownloadWorker } from "../media/media-download-worker.js";
import { MediaLinkRenewer } from "../media/media-link-renewer.js";
import { attachRenewLinkListener, RenewLinkReplyWaiter } from "../zalo/renew-link-control-listener.js";
import { installRenewMediaLinkApi } from "../zalo/zca-renew-media-link-api.js";
import { OutboxSender } from "../outbox/outbox-sender-loop.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { recordSuspendGap } from "../storage/connection-event-store.js";
import { HEARTBEAT_STALE_MS } from "../storage/daemon-liveness.js";
import path from "node:path";
import { startArchiveListener } from "../zalo/archive-listener.js";
import type { ListenerRetryInfo } from "../zalo/listener-reconnect-timer.js";
import { MobileSyncSession } from "../zalo/mobile-sync/mobile-sync-session.js";
import { startKeepAliveLoop } from "../zalo/keep-alive-loop.js";
import { startDirectoryLookupLoop } from "./directory-lookup-loop.js";

export type DaemonDeps = {
  api: API;
  db: DatabaseSync;
  env: AppEnv;
  paths: AccountPaths;
  keyHex: string;
  log: Logger;
  /** Listener bỏ cuộc (phiên nhiều khả năng đã chết) - caller chuyển trạng thái, đòi đăng nhập lại */
  onGaveUp: () => void;
  /** Nick ở chế độ Chỉ đọc: vòng gửi không gửi gì */
  isReadOnly: () => boolean;
};

export type ArchiveHandle = {
  stop: () => void;
  isListenerConnected: () => boolean;
  /** Lần nối lại listener đang hẹn + lý do kết nối bị đóng */
  listenerRetry: () => ListenerRetryInfo;
  /** Nối listener lại ngay thay vì chờ giờ hẹn; false nếu không có lần nối lại nào đang hẹn */
  reconnectListenerNow: () => boolean;
  /** Đồng bộ lịch sử từ điện thoại cho phiên này (chỉ chạy khi người dùng bấm trên dashboard) */
  mobileSync?: MobileSyncSession;
};

const HEARTBEAT_MS = 60_000;

/**
 * Ghép mọi khối chạy khi ĐÃ đăng nhập Zalo: listener ghi kho, tải media, đồng bộ
 * danh bạ, vòng gửi (nơi duy nhất gọi Zalo để gửi), keepAlive. Trả hàm dừng sạch.
 */
export function startArchiveDaemon(d: DaemonDeps): ArchiveHandle {
  const { api, db, env, log } = d;
  const stops: Array<() => void> = [];
  const every = (ms: number, fn: () => unknown) => {
    const t = setInterval(fn, ms);
    stops.push(() => clearInterval(t));
  };

  // Tên + avatar nhóm, hồ sơ người nhắn, ảnh sticker, danh sách bạn bè
  const directory = startDirectoryLookupLoop({
    api,
    db,
    log: log.child({ part: "directory" }),
    friendSyncEveryMs: env.DIRECTORY_SYNC_HOURS * 3_600_000,
    contactLookupGapMs: env.DIRECTORY_CONTACT_LOOKUP_GAP_SECONDS * 1000,
    rateLimitPauseMs: env.DIRECTORY_RATE_LIMIT_PAUSE_MINUTES * 60_000,
  });
  stops.push(directory.stop);

  const listener = startArchiveListener({
    api,
    db,
    journalDir: d.paths.journalDir,
    log: log.child({ part: "listener" }),
    reconnect: {
      baseDelayMs: env.RECONNECT_BASE_DELAY_SECONDS * 1000,
      maxDelayMs: env.RECONNECT_MAX_DELAY_SECONDS * 1000,
      duplicateWaitMs: env.RECONNECT_DUPLICATE_WAIT_MINUTES * 60_000,
      duplicateFirstRetryMs: env.RECONNECT_DUPLICATE_FIRST_RETRY_SECONDS * 1000,
      giveUpAfterFlaps: env.RECONNECT_GIVE_UP_AFTER_FLAPS,
    },
    offlineReplay: env.OFFLINE_REPLAY_ENABLED ? { minIntervalMs: env.OFFLINE_REPLAY_MIN_INTERVAL_MINUTES * 60_000 } : null,
    onGaveUp: d.onGaveUp,
    onFriendListChanged: directory.requestFriendSync,
  });
  stops.push(listener.stop);

  // Heartbeat: lần khởi động sau biết tiến trình chết lúc nào; MCP biết daemon còn sống để gửi.
  // Hai nhịp cách quá xa (theo giờ máy) là máy vừa ngủ dậy: ghi bù khoảng không nghe đó.
  let lastTick = { at: Date.now(), connected: listener.isConnected() };
  every(HEARTBEAT_MS, () => {
    const now = Date.now();
    const connected = listener.isConnected();
    if (lastTick.connected && now - lastTick.at > HEARTBEAT_STALE_MS) {
      const fromIso = new Date(lastTick.at).toISOString();
      recordSuspendGap(db, { fromIso, nowIso: new Date(now).toISOString(), listenerConnected: connected });
      log.warn({ from: fromIso, minutes: Math.round((now - lastTick.at) / 60_000) }, "Máy vừa ngủ dậy (hoặc daemon bị treo) - đã ghi khoảng không nghe");
    }
    lastTick = { at: now, connected };
    if (connected) setMeta(db, "listener_heartbeat_at", new Date(now).toISOString());
  });


  if (env.MEDIA_DOWNLOAD_ENABLED) {
    const renewLog = log.child({ part: "media-renew" });
    const replies = new RenewLinkReplyWaiter();
    if (env.MEDIA_RENEW_ENABLED) {
      stops.push(
        attachRenewLinkListener(
          api,
          (results) => {
            const matched = replies.deliver(results);
            renewLog.info({ results: results.length, matched, keys: results.map((r) => r.key.slice(0, 120)) }, "Zalo trả link qua WebSocket");
          },
          (err) => renewLog.warn({ err }, "Không đọc được sự kiện renew_link"),
        ),
      );
    }
    const renewer = env.MEDIA_RENEW_ENABLED
      ? new MediaLinkRenewer({
          db,
          replies,
          call: installRenewMediaLinkApi(api),
          pacing: {
            minGapSeconds: env.MEDIA_RENEW_MIN_GAP_SECONDS,
            maxGapSeconds: env.MEDIA_RENEW_MAX_GAP_SECONDS,
            dailyCap: env.MEDIA_RENEW_DAILY_CAP,
            timeZone: env.ARCHIVE_TIMEZONE,
          },
          log: renewLog,
        })
      : undefined;
    const requeued = renewer?.requeueExpired(new Date()) ?? 0;
    if (requeued > 0) log.info({ requeued }, "Đã xếp lượt xin lại link cho file hỏng vì link hết hạn");
    const media = new MediaDownloadWorker({
      renewer,
      db,
      mediaDir: d.paths.mediaDir,
      log: log.child({ part: "media" }),
      allowedHostSuffixes: env.MEDIA_ALLOWED_HOST_SUFFIXES,
      maxBytes: env.MEDIA_MAX_MEGABYTES * 1024 * 1024,
      maxAttempts: env.MEDIA_MAX_ATTEMPTS,
      downloadTimeoutMs: env.MEDIA_DOWNLOAD_TIMEOUT_MINUTES * 60_000,
    });
    const swept = media.sweepTempFiles();
    if (swept > 0) log.info({ swept }, "Đã xóa file media tải dở từ lần chạy trước");
    media.start();
    stops.push(() => media.stop());
  }

  const toZaloType = (t: "user" | "group") => (t === "group" ? ThreadType.Group : ThreadType.User);
  const sender = new OutboxSender({
    db,
    env,
    log: log.child({ part: "sender" }),
    isListenerConnected: listener.isConnected,
    isReadOnly: d.isReadOnly,
    sendText: async (threadId, type, text) => {
      const res = await api.sendMessage(text, threadId, toZaloType(type));
      return { msgId: res.message?.msgId !== undefined ? String(res.message.msgId) : null };
    },
    sendTyping: async (threadId, type) => {
      await api.sendTypingEvent(threadId, toZaloType(type));
    },
  });
  sender.start();
  stops.push(() => sender.stop());

  // Đồng bộ từ điện thoại: chỉ gắn listener sự kiện, không tự gửi yêu cầu nào
  const mobileSync = new MobileSyncSession({
    api,
    db,
    accountId: path.basename(d.paths.root),
    workDir: path.join(d.paths.root, "mobile-sync-tmp"),
    log: log.child({ part: "mobile-sync" }),
  });
  stops.push(() => mobileSync.dispose());

  stops.push(
    startKeepAliveLoop({
      api,
      minutes: env.ZALO_KEEPALIVE_MINUTES,
      credentialsFile: d.paths.credentialsFile,
      keyHex: d.keyHex,
      log: log.child({ part: "keepalive" }),
    }),
  );

  return {
    isListenerConnected: listener.isConnected,
    listenerRetry: listener.retryInfo,
    reconnectListenerNow: listener.reconnectNow,
    mobileSync,
    stop: () => {
      for (const stop of stops.reverse()) {
        try {
          stop();
        } catch (err) {
          log.warn({ err }, "Lỗi khi dừng một khối");
        }
      }
    },
  };
}
