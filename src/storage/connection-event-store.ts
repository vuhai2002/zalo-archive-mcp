import type { DatabaseSync } from "node:sqlite";

export type ConnectionEventKind = "login" | "connected" | "closed" | "error" | "gave_up" | "stopped";

export type ConnectionEvent = {
  at: string;
  kind: ConnectionEventKind;
  code: number | null;
  detail: string | null;
};

export function recordConnectionEvent(
  db: DatabaseSync,
  kind: ConnectionEventKind,
  opts: { code?: number | null; detail?: string | null; at?: string } = {},
): void {
  db.prepare("INSERT INTO connection_events (at, kind, code, detail) VALUES (?, ?, ?, ?)").run(
    opts.at ?? new Date().toISOString(),
    kind,
    opts.code ?? null,
    opts.detail?.slice(0, 1000) ?? null,
  );
}

export function recentConnectionEvents(db: DatabaseSync, limit: number): ConnectionEvent[] {
  const rows = db
    .prepare("SELECT at, kind, code, detail FROM connection_events ORDER BY at DESC, id DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    at: String(r.at),
    kind: r.kind as ConnectionEventKind,
    code: r.code === null ? null : Number(r.code),
    detail: (r.detail as string | null) ?? null,
  }));
}

/** Sự kiện đánh dấu listener bắt đầu / thôi nghe ('error' và 'login' không đổi trạng thái nghe) */
const LIFECYCLE_KINDS = "('connected', 'closed', 'gave_up', 'stopped')";

function lastLifecycleEvent(db: DatabaseSync, beforeIso?: string): { at: string; kind: string; code: number | null } | null {
  const row = db
    .prepare(
      `SELECT at, kind, code FROM connection_events
       WHERE kind IN ${LIFECYCLE_KINDS} AND (:before IS NULL OR at < :before)
       ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .get({ before: beforeIso ?? null }) as { at: string; kind: string; code: number | null } | undefined;
  return row ?? null;
}

/**
 * Daemon chết đột ngột (mất điện, kill) thì không kịp ghi `closed`/`stopped`,
 * nên khoảng thủng sau đó sẽ vô hình. Lúc khởi động, nếu trạng thái nghe cuối
 * vẫn là `connected`, ghi bù một `closed` tại mốc heartbeat cuối cùng còn biết.
 */
export function closeDanglingConnection(db: DatabaseSync, lastHeartbeatAt: string | null): boolean {
  const last = lastLifecycleEvent(db);
  if (last?.kind !== "connected") return false;
  const at = lastHeartbeatAt && lastHeartbeatAt > last.at ? lastHeartbeatAt : last.at;
  recordConnectionEvent(db, "closed", { at, detail: "Tiến trình dừng đột ngột (ghi bù lúc khởi động lại)" });
  return true;
}

export type ListenerGap = {
  from: string;
  to: string | null;
  closeCode: number | null;
  /** Không có sự kiện đóng, chỉ suy ra từ heartbeat đã cũ: nhiều khả năng daemon đang không chạy */
  suspected?: boolean;
};

export type GapOptions = { lastHeartbeatAt: string | null; nowIso: string; staleAfterMs: number };

/**
 * Các khoảng listener KHÔNG nghe (từ lúc đóng tới lúc nối lại kế tiếp), mới
 * nhất trước. `to = null` nghĩa là hiện vẫn chưa nối lại. Tin gửi trong các
 * khoảng này có thể thiếu trong kho - báo thẳng cho model, không giấu.
 *
 * Khoảng bắt đầu TRƯỚC `sinceIso` vẫn được tính (cắt từ `sinceIso`). Có
 * `opts` thì còn báo khoảng nghi ngờ khi trạng thái cuối là `connected` nhưng
 * heartbeat đã cũ (daemon chết mà chưa khởi động lại để ghi bù).
 */
export function listenerGaps(db: DatabaseSync, sinceIso: string, opts?: GapOptions): ListenerGap[] {
  const rows = db
    .prepare(
      `SELECT at, kind, code FROM connection_events
       WHERE at >= ? AND kind IN ${LIFECYCLE_KINDS}
       ORDER BY at, id`,
    )
    .all(sinceIso) as Array<{ at: string; kind: string; code: number | null }>;

  const before = lastLifecycleEvent(db, sinceIso);
  const gaps: ListenerGap[] = [];
  let open: ListenerGap | null =
    before && before.kind !== "connected" ? { from: sinceIso, to: null, closeCode: before.code } : null;
  let lastConnectedAt: string | null = before?.kind === "connected" ? before.at : null;
  for (const r of rows) {
    if (r.kind === "connected") {
      lastConnectedAt = r.at;
      if (open) {
        open.to = r.at;
        gaps.push(open);
        open = null;
      }
    } else {
      lastConnectedAt = null;
      open ??= { from: r.at, to: null, closeCode: r.code };
    }
  }
  if (open) gaps.push(open);

  if (!open && lastConnectedAt && opts) {
    const alive = opts.lastHeartbeatAt && opts.lastHeartbeatAt > lastConnectedAt ? opts.lastHeartbeatAt : lastConnectedAt;
    if (Date.parse(opts.nowIso) - Date.parse(alive) > opts.staleAfterMs) {
      gaps.push({ from: alive, to: null, closeCode: null, suspected: true });
    }
  }
  return gaps.reverse();
}
