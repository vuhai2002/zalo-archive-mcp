import type { DatabaseSync } from "node:sqlite";

/**
 * Kết quả mỗi lượt xin Zalo gửi bù tin lỡ (offline-message-replay.ts), theo hàng chờ. Dùng để trả lời "khoảng listener
 * không nghe này đã lấy bù đủ chưa" thay vì đoán.
 * - `complete`: Zalo báo hết trang và không báo đã bỏ bớt phần cũ - mọi thứ sau mốc đã về kho.
 * - `incomplete`: dừng dở (chạm trần trang, trang không về, mất kết nối giữa chừng, Zalo báo bỏ bớt phần cũ...).
 * - `new_session`: nick vừa đăng nhập lại bằng QR - Zalo coi là máy mới, lượt lấy bù trả hết mà vẫn thiếu tin.
 */
export type BackfillOutcome = "complete" | "incomplete" | "new_session";
export type BackfillRun = {
  queue: string;
  startedAt: string;
  finishedAt: string;
  pages: number;
  items: number;
  outcome: BackfillOutcome;
  detail: string | null;
};
export type GapBackfillStatus = "filled" | "incomplete" | "unknown";
export type GapBackfill = { status: GapBackfillStatus; items: number; detail: string | null };

/** Chỉ hai hàng chờ TIN quyết định khoảng có thiếu tin không (cảm xúc / sự kiện nhóm không tính) */
const MESSAGE_QUEUES = ["user_messages", "group_messages"] as const;
/**
 * Lượt lấy bù tính cho một khoảng: từ hơi sớm hơn lúc nối lại (mốc sự kiện lệch vài giây) tới 7 ngày sau. Mốc lấy bù chỉ
 * tiến qua những gì đã về kho, nên lượt đủ đến SAU (mạng yếu lúc nối, lần nối sau mới lấy hết) vẫn phủ khoảng này; 7 ngày
 * nằm trong khoảng 2 tuần Zalo giữ hàng chờ.
 */
const WINDOW_BEFORE_MS = 2 * 60_000;
const WINDOW_AFTER_MS = 7 * 24 * 60 * 60_000;
const EVICTED = /bỏ bớt/;
const NEW_SESSION_DETAIL = "Nick vừa đăng nhập lại bằng QR - Zalo không gửi bù tin cho phiên mới, cần đồng bộ từ điện thoại";

export function recordBackfillRun(db: DatabaseSync, r: BackfillRun): void {
  db.prepare(
    "INSERT INTO backfill_runs (queue, started_at, finished_at, pages, items, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(r.queue, r.startedAt, r.finishedAt, r.pages, r.items, r.outcome, r.detail);
}

/** Đăng nhập lại bằng QR sau một quãng không nghe: ghi cho cả hai hàng chờ tin là phiên mới (lấy bù không đủ) */
export function recordNewSessionBackfill(db: DatabaseSync, atIso: string): void {
  for (const queue of MESSAGE_QUEUES) {
    recordBackfillRun(db, { queue, startedAt: atIso, finishedAt: atIso, pages: 0, items: 0, outcome: "new_session", detail: NEW_SESSION_DETAIL });
  }
}

/**
 * Khoảng không nghe kết thúc (nối lại) lúc `gapEndIso` đã được lấy bù đủ chưa, xét các lượt từ lúc nối lại trở đi:
 * - mỗi hàng chờ tin lấy lượt XONG đầu tiên; cả hai có thì đủ (cộng số tin Zalo gửi lại ở hai lượt đó), kể cả khi lượt
 *   ngay lúc nối dừng dở vì mạng yếu;
 * - trước khi xong mà nick đăng nhập lại bằng QR (`new_session`), hay Zalo báo hàng chờ đầy bỏ bớt phần cũ: có thể thiếu;
 * - chưa xong mà có lượt dừng dở: có thể thiếu, kèm lý do gần nhất;
 * - còn lại (không có lượt nào - khoảng trước khi có bảng này): chưa rõ.
 */
export function backfillForGap(db: DatabaseSync, gapEndIso: string): GapBackfill {
  const end = Date.parse(gapEndIso);
  const rows = db
    .prepare(
      `SELECT queue, started_at AS startedAt, items, outcome, detail FROM backfill_runs
       WHERE started_at >= ? AND started_at <= ? AND queue IN ('user_messages', 'group_messages')
       ORDER BY started_at, id`,
    )
    .all(new Date(end - WINDOW_BEFORE_MS).toISOString(), new Date(end + WINDOW_AFTER_MS).toISOString()) as Array<{
    queue: string;
    startedAt: string;
    items: number;
    outcome: BackfillOutcome;
    detail: string | null;
  }>;
  const complete = MESSAGE_QUEUES.map((q) => rows.find((r) => r.queue === q && r.outcome === "complete"));
  // Chỉ những gì xảy ra trước khi cả hai hàng chờ xong mới ảnh hưởng khoảng này
  const doneAt = complete.every(Boolean) ? complete.reduce((m, r) => (r!.startedAt > m ? r!.startedAt : m), "") : null;
  const before = doneAt === null ? rows : rows.filter((r) => r.startedAt <= doneAt);
  const lost = before.find((r) => r.outcome === "new_session" || (r.outcome === "incomplete" && EVICTED.test(r.detail ?? "")));
  if (lost) return { status: "incomplete", items: 0, detail: lost.detail };
  if (doneAt !== null) return { status: "filled", items: complete.reduce((n, r) => n + Number(r!.items), 0), detail: null };
  const stopped = [...rows].reverse().find((r) => r.outcome === "incomplete");
  if (stopped) return { status: "incomplete", items: 0, detail: stopped.detail };
  return { status: "unknown", items: 0, detail: null };
}
