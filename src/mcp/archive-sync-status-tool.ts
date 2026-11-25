import type { UpdateInfo } from "../shared/github-release-update-check.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { attachmentStatusCounts } from "../storage/attachment-queue-store.js";
import { listenerGaps, recentConnectionEvents } from "../storage/connection-event-store.js";
import { HEARTBEAT_STALE_MS } from "../storage/daemon-liveness.js";
import { annotateGapsWithBackfill } from "../storage/listener-gap-backfill.js";
import { getMeta } from "../storage/thread-directory-store.js";
import type { ReadToolContext } from "./archive-read-tool-handlers.js";
import { describeListenerGaps } from "./archive-sync-status-gaps.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import { toolOk, type ToolResult } from "./tool-result.js";

const GAP_LOOKBACK_DAYS = 7;

/**
 * Báo TRUNG THỰC kho đang phủ tới đâu: các khoảng listener không nghe (kèm Zalo đã
 * gửi bù đủ hay có thể thiếu), media chưa tải, trạng thái cổng gửi. Khoảng có thể thiếu
 * thì model phải nói "có thể thiếu tin" thay vì khẳng định "không có tin nào".
 */
export function syncStatusTool(ctx: ReadToolContext & { readonly readOnly: boolean }, update: UpdateInfo | null = null): ToolResult {
  const { db, env } = ctx;
  const tz = env.ARCHIVE_TIMEZONE;
  const t = (iso: string | null) => formatLocalTime(iso, tz);

  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM messages) AS messages, (SELECT COUNT(*) FROM threads) AS threads,
         (SELECT MIN(sent_at) FROM messages) AS oldest, (SELECT MAX(sent_at) FROM messages) AS newest`,
    )
    .get() as { messages: number; threads: number; oldest: string | null; newest: string | null };
  const bySource = db.prepare("SELECT source, COUNT(*) AS n FROM messages GROUP BY source").all() as Array<{
    source: string;
    n: number;
  }>;
  const outbox = db.prepare("SELECT status, COUNT(*) AS n FROM outbox GROUP BY status").all() as Array<{
    status: string;
    n: number;
  }>;

  const since = new Date(Date.now() - GAP_LOOKBACK_DAYS * 86_400_000).toISOString();
  const heartbeat = getMeta(db, "listener_heartbeat_at");
  const gaps = annotateGapsWithBackfill(
    db,
    listenerGaps(db, since, { lastHeartbeatAt: heartbeat, nowIso: new Date().toISOString(), staleAfterMs: HEARTBEAT_STALE_MS }),
  );
  const sessionState = getMeta(db, "daemon_session_state");
  const events = recentConnectionEvents(db, 8);
  const kill = getKillSwitch(db);
  const media = attachmentStatusCounts(db);

  const lines = [
    `Tài khoản: ${getMeta(db, "self_display_name") ?? "?"} (uid ${getMeta(db, "self_uid") ?? "?"}), thư mục ${ctx.accountId}.`,
    `Kho: ${counts.messages} tin, ${counts.threads} hội thoại, từ ${t(counts.oldest)} tới ${t(counts.newest)} (giờ ${tz}).`,
    `Theo nguồn: ${bySource.map((s) => `${s.source}=${s.n}`).join(", ") || "chưa có"}.`,
    `Listener: heartbeat cuối ${t(heartbeat)}.`,
    describeListenerGaps(gaps, t, GAP_LOOKBACK_DAYS),
    `Sự kiện kết nối gần nhất: ${events.map((e) => `${t(e.at)} ${e.kind}${e.code !== null ? `(${e.code})` : ""}`).join("; ") || "chưa có"}.`,
    `Media: ${Object.entries(media).map(([k, v]) => `${k}=${v}`).join(", ") || "chưa có"}.`,
    `Hàng đợi gửi: ${outbox.map((o) => `${o.status}=${o.n}`).join(", ") || "trống"}.`,
    // Nick Chỉ đọc: daemon chạy vẫn không gửi gì, nên không được để model hiểu "running" là gửi được
    ctx.readOnly
      ? `Daemon: ${sessionState ?? "chưa từng chạy"}. Nick này CHỈ ĐỌC: không soạn, không gửi tin nào (người dùng tự mở gửi trên dashboard).`
      : `Daemon: ${sessionState ?? "chưa từng chạy"} (running = đang gửi được); kill switch ${kill.killed ? `ĐANG KHÓA (${kill.reason})` : "mở"}.`,
    "Lưu ý: kho chỉ có tin từ lúc bắt đầu chạy listener; tin cũ hơn chưa có.",
  ];
  if (update?.updateAvailable && update.latest) {
    lines.push(
      `Có bản mới v${update.latest} của Zalo Archive MCP (đang chạy v${update.current}). Người dùng muốn cập nhật thì làm theo ` +
        'mục "Cập nhật" trong README.md của repo (không tự cập nhật khi người dùng chưa bảo).',
    );
  }
  return toolOk(lines.join("\n"));
}
