import { getKillSwitch } from "../storage/send-control-store.js";
import { attachmentStatusCounts } from "../storage/attachment-queue-store.js";
import { listenerGaps, recentConnectionEvents } from "../storage/connection-event-store.js";
import { HEARTBEAT_STALE_MS } from "../storage/daemon-liveness.js";
import { getMeta } from "../storage/thread-directory-store.js";
import type { ReadToolContext } from "./archive-read-tool-handlers.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import { toolOk, type ToolResult } from "./tool-result.js";

const GAP_LOOKBACK_DAYS = 7;

/**
 * Báo TRUNG THỰC kho đang phủ tới đâu: các khoảng listener không nghe (tin
 * trong đó có thể thiếu), media chưa tải, trạng thái cổng gửi. Model phải nói
 * với người dùng "có thể thiếu tin" thay vì khẳng định "không có tin nào".
 */
export function syncStatusTool(ctx: ReadToolContext & { readonly readOnly: boolean }): ToolResult {
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
  const gaps = listenerGaps(db, since, {
    lastHeartbeatAt: heartbeat,
    nowIso: new Date().toISOString(),
    staleAfterMs: HEARTBEAT_STALE_MS,
  });
  const sessionState = getMeta(db, "daemon_session_state");
  const events = recentConnectionEvents(db, 8);
  const kill = getKillSwitch(db);
  const media = attachmentStatusCounts(db);

  const lines = [
    `Tài khoản: ${getMeta(db, "self_display_name") ?? "?"} (uid ${getMeta(db, "self_uid") ?? "?"}), thư mục ${ctx.accountId}.`,
    `Kho: ${counts.messages} tin, ${counts.threads} hội thoại, từ ${t(counts.oldest)} tới ${t(counts.newest)} (giờ ${tz}).`,
    `Theo nguồn: ${bySource.map((s) => `${s.source}=${s.n}`).join(", ") || "chưa có"}.`,
    `Listener: heartbeat cuối ${t(heartbeat)}.`,
    gaps.length
      ? `Khoảng KHÔNG nghe trong ${GAP_LOOKBACK_DAYS} ngày (tin trong đó có thể thiếu):\n${gaps
          .map((g) => `  - ${t(g.from)} -> ${g.to ? t(g.to) : "HIỆN VẪN CHƯA NỐI LẠI"}${g.closeCode !== null ? ` (mã ${g.closeCode})` : ""}${g.asleep ? " (máy ngủ / daemon bị treo; tin trong khoảng này thường đã được Zalo gửi bù khi nối lại)" : ""}${g.suspected ? " (heartbeat đã cũ - nhiều khả năng daemon không chạy)" : ""}`)
          .join("\n")}`
      : `Không có khoảng thủng nào được ghi nhận trong ${GAP_LOOKBACK_DAYS} ngày.`,
    `Sự kiện kết nối gần nhất: ${events.map((e) => `${t(e.at)} ${e.kind}${e.code !== null ? `(${e.code})` : ""}`).join("; ") || "chưa có"}.`,
    `Media: ${Object.entries(media).map(([k, v]) => `${k}=${v}`).join(", ") || "chưa có"}.`,
    `Hàng đợi gửi: ${outbox.map((o) => `${o.status}=${o.n}`).join(", ") || "trống"}.`,
    // Nick Chỉ đọc: daemon chạy vẫn không gửi gì, nên không được để model hiểu "running" là gửi được
    ctx.readOnly
      ? `Daemon: ${sessionState ?? "chưa từng chạy"}. Nick này CHỈ ĐỌC: không soạn, không gửi tin nào (người dùng tự mở gửi trên dashboard).`
      : `Daemon: ${sessionState ?? "chưa từng chạy"} (running = đang gửi được); kill switch ${kill.killed ? `ĐANG KHÓA (${kill.reason})` : "mở"}.`,
    "Lưu ý: kho chỉ có tin từ lúc bắt đầu chạy listener; tin cũ hơn chưa có.",
  ];
  return toolOk(lines.join("\n"));
}
