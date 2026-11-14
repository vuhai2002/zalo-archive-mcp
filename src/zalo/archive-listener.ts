import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { ThreadType, type API } from "zca-js";
import { ingestArchiveEvent, type ArchiveEvent } from "../archive/archive-event-ingestor.js";
import { appendJournal } from "../archive/raw-event-journal.js";
import { removeOrphanMediaFiles } from "../media/remove-orphan-media-files.js";
import { recordConnectionEvent } from "../storage/connection-event-store.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";
import { applyFriendEvent, applyGroupEvent, applyReplayedGroupEvent } from "./directory-event-handlers.js";
import { describeListenerError, isNetworkErrorCode } from "./listener-error-details.js";
import type { ReplayQueue } from "../storage/offline-replay-cursor-store.js";
import { attachControlsQueueListener } from "./offline-group-event-replay.js";
import { createMissedMessageRequester } from "./offline-message-replay.js";
import { ListenerReconnectTimer, type ListenerRetryInfo } from "./listener-reconnect-timer.js";
import { ReconnectPlanner, type ReconnectPlannerOptions } from "./reconnect-planner.js";
import { messageToRaw, undoToRaw } from "./zalo-event-to-raw.js";

export type ArchiveListenerOptions = {
  api: API;
  db: DatabaseSync;
  journalDir: string;
  /** Thư mục file media: xóa file của tin bị xóa hẳn (My Documents) */
  mediaDir: string;
  log: Logger;
  reconnect: ReconnectPlannerOptions;
  /** Xin bù tin lỡ khi kết nối; null = tắt */
  offlineReplay: { minIntervalMs: number } | null;
  /** Gọi khi listener chớp-tắt quá ngưỡng: phiên nhiều khả năng đã chết */
  onGaveUp: () => void;
  /** Có kết bạn / hủy kết bạn - daemon đồng bộ lại danh sách bạn bè */
  onFriendListChanged?: () => void;
};

export type ArchiveListenerHandle = {
  stop: () => void;
  isConnected: () => boolean;
  /** Lần nối lại đang hẹn + lý do kết nối bị đóng (dashboard hiện) */
  retryInfo: () => ListenerRetryInfo;
  /** Nối lại ngay thay vì chờ giờ hẹn; false nếu không có lần nối lại nào đang hẹn */
  reconnectNow: () => boolean;
  /** Xin Zalo gửi bù tin lỡ ngay (máy vừa thức mà kết nối không đứt); false nếu đang mất kết nối hoặc đang có lượt dở */
  requestMissedNow: () => boolean;
};

/** Mã giả khi `start()` ném (không phải close code thật) */
const START_THREW_CODE = -1;
const JITTER_MS = 3_000;
const ERROR_RECORD_INTERVAL_MS = 60_000;

/**
 * Nghe mọi sự kiện của tài khoản và ghi vào kho. Mỗi sự kiện: ghi NHẬT KÝ
 * nguyên văn trước, rồi mới chuẩn hóa + ghi DB.
 *
 * Tự nối lại ở tầng app (`retryOnClose: false`): cơ chế thử lại của zca-js lấy
 * mã/số lần từ cấu hình máy chủ và bộ đếm không bao giờ reset.
 */
export function startArchiveListener(opts: ArchiveListenerOptions): ArchiveListenerHandle {
  const { api, db, log } = opts;
  const listener = api.listener;
  const planner = new ReconnectPlanner(opts.reconnect);
  let stopped = false;
  let connected = false;
  const retry = new ListenerReconnectTimer();
  let lastErrorRecordedAt = 0;
  // Lỗi gần nhất TRƯỚC lần đóng này, để phân biệt mất mạng với phiên bị từ chối
  let lastErrorCode: string | null = null;
  const missed = opts.offlineReplay ? createMissedMessageRequester(api, db, log, opts.offlineReplay) : null;

  const journal = (event: string, payload: unknown) => {
    try {
      appendJournal(opts.journalDir, { at: new Date().toISOString(), event, payload });
    } catch (err) {
      log.error({ err, event }, "Không ghi được nhật ký thô");
    }
  };

  const safely = (event: string, work: () => void) => {
    try {
      work();
    } catch (err) {
      log.warn({ err, event }, "Không xử lý được sự kiện (vẫn còn trong nhật ký)");
    }
  };

  const handle = (event: ArchiveEvent) => {
    journal(event.kind, event);
    const stats = ingestArchiveEvent(db, event, new Date(), log);
    log.debug({ kind: event.kind, ...stats }, "Đã ghi sự kiện");
    if (stats.deleted > 0) {
      safely("delete", () => removeOrphanMediaFiles(opts.mediaDir, stats.orphanFiles));
      log.info({ deleted: stats.deleted, files: stats.orphanFiles.length }, "Đã xóa hẳn tin bạn xóa trong My Documents");
    }
  };

  listener.on("message", (m) => {
    handle({ kind: "message", message: messageToRaw(m) });
    safely("message", () => missed?.onLiveEvent(m.type === ThreadType.Group ? "group_messages" : "user_messages", m.data.msgId));
  });
  listener.on("undo", (u) => handle({ kind: "undo", undo: undoToRaw(u) }));
  listener.on("old_messages", (msgs) => handle({ kind: "old_messages", messages: msgs.map(messageToRaw) }));
  // Phần còn lại của phản hồi lấy bù (mã trang tiếp theo...), có nhờ bản vá zca-js - xem offline-message-replay.ts
  const onReplayPage = (event: string, groupQueue: ReplayQueue, userQueue: ReplayQueue) =>
    (listener as unknown as NodeJS.EventEmitter).on(event, (page: unknown) => {
      journal(event, page);
      const group = (page as { threadType?: unknown } | null)?.threadType === ThreadType.Group;
      safely(event, () => missed?.onPage(group ? groupQueue : userQueue, page));
    });
  onReplayPage("old_messages_meta", "group_messages", "user_messages");
  onReplayPage("old_reactions_meta", "group_reactions", "user_reactions");
  // Cảm xúc + sự kiện nhóm: nhật ký ghi payload nguyên văn (như trước), rồi vào kho
  const ingestRaw = (event: ArchiveEvent, source?: "old_messages") => ingestArchiveEvent(db, event, new Date(), log, source);
  listener.on("reaction", (r) => {
    journal("reaction", r);
    safely("reaction", () => ingestRaw({ kind: "reaction", reaction: r }));
    safely("reaction", () => missed?.onLiveEvent(r.isGroup ? "group_reactions" : "user_reactions", r.data.msgId));
  });
  listener.on("old_reactions", (rs, isGroup) => {
    journal("old_reactions", { isGroup, reactions: rs });
    safely("old_reactions", () => ingestRaw({ kind: "old_reactions", reactions: rs }));
  });
  // Sự kiện nhóm: thành tin hệ thống giữa dòng chat, rồi cập nhật danh bạ (tên nhóm, thành viên).
  // Ghi tin TRƯỚC khi đổi tên nhóm trong danh bạ: cần tên cũ để nhận ra đổi tên.
  const onGroupEvent = (e: unknown, replayed = false) => {
    journal("group_event", e);
    safely("group_event", () => ingestRaw({ kind: "group_event", event: e }, replayed ? "old_messages" : undefined));
    safely("group_event", () => (replayed ? applyReplayedGroupEvent : applyGroupEvent)(db, e));
  };
  listener.on("group_event", (e) => onGroupEvent(e));
  // Sự kiện nhóm lỡ lúc tắt máy (hàng chờ điều khiển cmd 603): đi chung đường với sự kiện trực tiếp,
  // theo đúng thứ tự Zalo trả, rồi báo trang về để xin trang sau / lưu mốc
  const detachControlsQueue = missed
    ? attachControlsQueueListener(
        api,
        () => getMeta(db, "self_uid"),
        (page) => {
          for (const e of page.events) onGroupEvent(e, true);
          safely("old_group_events", () => missed.onPage("group_events", page));
        },
        (err) => log.warn({ err }, "Không đọc được trang lấy bù sự kiện nhóm"),
      )
    : () => {};
  listener.on("friend_event", (e) => {
    journal("friend_event", e);
    safely("friend_event", () => {
      if (applyFriendEvent(db, e)) opts.onFriendListChanged?.();
    });
  });

  listener.on("connected", () => {
    connected = true;
    lastErrorCode = null;
    retry.clear();
    planner.markConnected(Date.now());
    recordConnectionEvent(db, "connected");
    setMeta(db, "listener_heartbeat_at", new Date().toISOString());
    log.info("Listener đã kết nối");
    missed?.onConnected();
  });

  // BẮT BUỘC có handler: EventEmitter không có listener cho "error" sẽ ném và làm chết tiến trình
  listener.on("error", (err: unknown) => {
    const { message, code } = describeListenerError(err);
    lastErrorCode = code;
    log.warn({ errorMessage: message, errorCode: code }, "Listener báo lỗi");
    if (Date.now() - lastErrorRecordedAt > ERROR_RECORD_INTERVAL_MS) {
      lastErrorRecordedAt = Date.now();
      recordConnectionEvent(db, "error", { detail: code ? `${code}: ${message}` : message });
    }
  });

  const onClosed = (code: number, reason: string) => {
    connected = false;
    const networkOutage = isNetworkErrorCode(lastErrorCode);
    lastErrorCode = null;
    // Lượt lấy bù đang dở không về được vì kết nối đã đóng - không phải Zalo chê mốc
    missed?.onDisconnected();
    if (stopped) return;
    retry.noteClosed(code, reason || (networkOutage ? "mất mạng" : null));
    recordConnectionEvent(db, "closed", { code, detail: reason || (networkOutage ? "mất mạng" : null) });
    const decision = planner.markClosed(Date.now(), code, Math.floor(Math.random() * JITTER_MS), networkOutage);
    if (decision.action === "give_up") {
      recordConnectionEvent(db, "gave_up", { code, detail: `${decision.flaps} lần nối rồi rớt ngay liên tiếp` });
      log.error(
        { code, flaps: decision.flaps },
        'Listener nối rồi rớt liên tục - phiên Zalo có thể đã hết hạn/bị thu hồi. Dừng hẳn; chạy "pnpm login" để đăng nhập lại.',
      );
      opts.onGaveUp();
      return;
    }
    log.warn(
      { code, closeReason: reason, delayMs: decision.delayMs, why: decision.reason, flaps: decision.flaps },
      "Listener bị đóng - sẽ nối lại",
    );
    retry.schedule(decision.delayMs, () => {
      if (stopped) return;
      try {
        listener.start({ retryOnClose: false });
      } catch (err) {
        log.error({ err }, "start() ném khi nối lại");
        onClosed(START_THREW_CODE, err instanceof Error ? err.message : String(err));
      }
    });
  };
  listener.on("closed", onClosed);

  listener.start({ retryOnClose: false });

  return {
    isConnected: () => connected,
    retryInfo: () => retry.info(),
    reconnectNow: () => {
      if (stopped || connected) return false;
      log.info("Người dùng bấm nối lại ngay");
      return retry.fireNow();
    },
    requestMissedNow: () => (!stopped && connected && missed ? missed.requestNow() : false),
    stop: () => {
      stopped = true;
      retry.clear();
      missed?.stop();
      detachControlsQueue();
      try {
        listener.stop();
      } catch {
        /* đã đóng sẵn */
      }
      recordConnectionEvent(db, "stopped");
    },
  };
}
