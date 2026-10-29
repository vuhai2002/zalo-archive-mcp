import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { startOfLocalDayDaysAgoUtc, startOfLocalDayUtc, startOfNextLocalDayUtc, startOfTodayUtc } from "../../shared/local-date-range.js";
import { getAttachment } from "../../storage/attachment-queue-store.js";
import { listenerGaps, recentConnectionEvents } from "../../storage/connection-event-store.js";
import { HEARTBEAT_STALE_MS } from "../../storage/daemon-liveness.js";
import { findThread, listThreadsPage, readThread, searchMessages } from "../../storage/message-read-queries.js";
import { archiveTotals, countBy, dailyMessageCounts, topThreadsSince } from "../../storage/overview-stats-queries.js";
import { getMeta, threadLabel } from "../../storage/thread-directory-store.js";
import type { OverviewResponse, SearchResponse, ThreadListResponse, ThreadMessagesResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toArchivedMessage } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Xem kho: tổng quan, hội thoại, tin, tìm kiếm, file media */
export function archiveBrowseRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db, env } = ctx;
  const tz = env.ARCHIVE_TIMEZONE;

  app.get("/overview", (c) => {
    const days = clampInt(c.req.query("days"), 30, 1, 365);
    const now = new Date();
    const { totals, mediaBytes } = archiveTotals(db, startOfTodayUtc(tz, now));
    const body: OverviewResponse = {
      totals,
      bySource: countBy(db, "messages", "source"),
      media: countBy(db, "attachments", "status"),
      mediaBytes,
      outbox: countBy(db, "outbox", "status"),
      daily: dailyMessageCounts(db, tz, days, now),
      // Cùng cửa sổ với biểu đồ ngày: từ 00:00 của ngày đầu tiên theo giờ kho
      topThreads: topThreadsSince(db, startOfLocalDayDaysAgoUtc(tz, days - 1, now), 10),
      gaps: listenerGaps(db, new Date(now.getTime() - 7 * 86_400_000).toISOString(), {
        lastHeartbeatAt: getMeta(db, "listener_heartbeat_at"),
        nowIso: now.toISOString(),
        staleAfterMs: HEARTBEAT_STALE_MS,
      }),
      recentEvents: recentConnectionEvents(db, 20),
    };
    return c.json(body);
  });

  app.get("/threads", (c) => {
    const page = listThreadsPage(db, {
      query: c.req.query("query"),
      limit: clampInt(c.req.query("limit"), 50, 1, 200),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    return c.json(page satisfies ThreadListResponse);
  });

  app.get("/threads/:threadId/messages", (c) => {
    const thread = findThread(db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    const beforeId = clampInt(c.req.query("beforeId"), 0, 0, Number.MAX_SAFE_INTEGER);
    const messages = readThread(db, {
      threadId: thread.threadId,
      threadType: thread.threadType,
      beforeId: beforeId || undefined,
      limit: clampInt(c.req.query("limit"), 50, 1, 200),
    });
    return c.json({ thread, messages: messages.map(toArchivedMessage) } satisfies ThreadMessagesResponse);
  });

  app.get("/search", (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    if (!q) return c.json({ messages: [] } satisfies SearchResponse);
    const fromDate = c.req.query("fromDate");
    const toDate = c.req.query("toDate");
    const fromIso = fromDate ? startOfLocalDayUtc(fromDate, tz) : undefined;
    const toIso = toDate ? startOfNextLocalDayUtc(toDate, tz) : undefined;
    if (fromIso === null || toIso === null) return c.json({ error: "Ngày phải dạng YYYY-MM-DD" }, 400);
    const messages = searchMessages(db, {
      query: q,
      threadId: c.req.query("threadId") || undefined,
      fromIso,
      toIso,
      limit: clampInt(c.req.query("limit"), 50, 1, 200),
    });
    const results = messages.map((m) => {
      const label = threadLabel(db, m.threadId);
      return { ...toArchivedMessage(m), threadName: label?.name ?? null, threadIsFriend: label?.isFriend ?? false };
    });
    return c.json({ messages: results } satisfies SearchResponse);
  });

  app.get("/media/:id", (c) => {
    const a = getAttachment(db, clampInt(c.req.param("id"), 0, 0, Number.MAX_SAFE_INTEGER));
    if (!a || a.status !== "done" || typeof a.local_path !== "string") return c.json({ error: "File chưa có" }, 404);
    // local_path do kho tự đặt (sha256 + đuôi), vẫn kiểm không thoát khỏi thư mục media
    const mediaRoot = path.resolve(ctx.paths.mediaDir);
    const file = path.resolve(mediaRoot, a.local_path);
    if (!file.startsWith(mediaRoot + path.sep) || !fs.existsSync(file)) return c.json({ error: "File chưa có" }, 404);
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    const fileName = typeof a.file_name === "string" ? a.file_name : path.basename(file);
    return c.body(stream, 200, {
      "content-type": typeof a.mime === "string" && a.mime ? a.mime : "application/octet-stream",
      "content-length": String(fs.statSync(file).size),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "x-content-type-options": "nosniff",
      // File do người lạ gửi: không cho chạy script nếu là HTML/SVG
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=86400",
    });
  });

  return app;
}
