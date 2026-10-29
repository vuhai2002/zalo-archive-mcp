import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { ingestArchiveEvent, type ArchiveEvent } from "../archive/archive-event-ingestor.js";
import { appendJournal } from "../archive/raw-event-journal.js";
import { recordConnectionEvent } from "../storage/connection-event-store.js";
import { setMeta } from "../storage/thread-directory-store.js";
import { applyFriendEvent, applyGroupEvent } from "./directory-event-handlers.js";
import { describeListenerError, isNetworkErrorCode } from "./listener-error-details.js";
import { requestMissedMessages } from "./offline-message-replay.js";
import { ReconnectPlanner, type ReconnectPlannerOptions } from "./reconnect-planner.js";
import { messageToRaw, undoToRaw } from "./zalo-event-to-raw.js";

export type ArchiveListenerOptions = {
  api: API;
  db: DatabaseSync;
  journalDir: string;
  log: Logger;
  reconnect: ReconnectPlannerOptions;
  offlineReplay: boolean;
  /** Gọi khi listener chớp-tắt quá ngưỡng: phiên nhiều khả năng đã chết */
  onGaveUp: () => void;
  /** Có kết bạn / hủy kết bạn - daemon đồng bộ lại danh sách bạn bè */
  onFriendListChanged?: () => void;
};

export type ArchiveListenerHandle = { stop: () => void; isConnected: () => boolean };

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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastErrorRecordedAt = 0;
  // Lỗi gần nhất TRƯỚC lần đóng này, để phân biệt mất mạng với phiên bị từ chối
  let lastErrorCode: string | null = null;

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
  };

  listener.on("message", (m) => handle({ kind: "message", message: messageToRaw(m) }));
  listener.on("undo", (u) => handle({ kind: "undo", undo: undoToRaw(u) }));
  listener.on("old_messages", (msgs) => handle({ kind: "old_messages", messages: msgs.map(messageToRaw) }));
  // Chưa đưa vào DB nhưng giữ nguyên văn để đắp sau (reaction, sự kiện nhóm, bạn bè)
  listener.on("reaction", (r) => journal("reaction", r));
  listener.on("old_reactions", (rs, isGroup) => journal("old_reactions", { isGroup, reactions: rs }));
  // Sự kiện nhóm / bạn bè: giữ nguyên văn, và cập nhật danh bạ ngay (tên nhóm, cờ bạn bè)
  listener.on("group_event", (e) => {
    journal("group_event", e);
    safely("group_event", () => applyGroupEvent(db, e));
  });
  listener.on("friend_event", (e) => {
    journal("friend_event", e);
    safely("friend_event", () => {
      if (applyFriendEvent(db, e)) opts.onFriendListChanged?.();
    });
  });

  listener.on("connected", () => {
    connected = true;
    lastErrorCode = null;
    planner.markConnected(Date.now());
    recordConnectionEvent(db, "connected");
    setMeta(db, "listener_heartbeat_at", new Date().toISOString());
    log.info("Listener đã kết nối");
    if (opts.offlineReplay) requestMissedMessages(api, log);
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
    if (stopped) return;
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
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      try {
        listener.start({ retryOnClose: false });
      } catch (err) {
        log.error({ err }, "start() ném khi nối lại");
        onClosed(START_THREW_CODE, err instanceof Error ? err.message : String(err));
      }
    }, decision.delayMs);
  };
  listener.on("closed", onClosed);

  listener.start({ retryOnClose: false });

  return {
    isConnected: () => connected,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try {
        listener.stop();
      } catch {
        /* đã đóng sẵn */
      }
      recordConnectionEvent(db, "stopped");
    },
  };
}
