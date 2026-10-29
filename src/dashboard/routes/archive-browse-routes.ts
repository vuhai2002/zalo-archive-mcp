import { Hono } from "hono";
import { startOfLocalDayDaysAgoUtc, startOfLocalDayUtc, startOfNextLocalDayUtc, startOfTodayUtc } from "../../shared/local-date-range.js";
import { listenerGaps, recentConnectionEvents } from "../../storage/connection-event-store.js";
import { GROUP_MOSAIC_MEMBERS } from "../../storage/contact-store.js";
import { HEARTBEAT_STALE_MS } from "../../storage/daemon-liveness.js";
import { findThread, listThreadsPage, readThread, searchMessages } from "../../storage/message-read-queries.js";
import { archiveTotals, countBy, dailyMessageCounts, topThreadsSince } from "../../storage/overview-stats-queries.js";
import { groupMemberAvatars, lastMessagePreview } from "../../storage/thread-list-extras.js";
import { setThreadPinned } from "../../storage/thread-pin-store.js";
import { getMeta, threadLabel } from "../../storage/thread-directory-store.js";
import type { OverviewResponse, SearchResponse, ThreadListResponse, ThreadMessagesResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toArchivedMessage } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Xem kho: tổng quan, hội thoại, tin, tìm kiếm (file media: media-file-route.ts) */
export function archiveBrowseRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db, env } = ctx;
  const tz = env.ARCHIVE_TIMEZONE;
  /** Nhóm không có ảnh riêng: 4 thành viên đầu để ghép avatar như Zalo */
  const groupAvatarParts = (type: string, id: string, avatarUrl: string | null) =>
    type === "group" && !avatarUrl ? groupMemberAvatars(db, id, GROUP_MOSAIC_MEMBERS) : { memberAvatars: [], memberCount: null };

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
      pinnedFirst: true,
    });
    const threads = page.threads.map((t) => ({
      ...t,
      lastMessage: lastMessagePreview(db, t.threadId, t.threadType) as ThreadListResponse["threads"][number]["lastMessage"],
      ...groupAvatarParts(t.threadType, t.threadId, t.avatarUrl),
    }));
    return c.json({ threads, total: page.total } satisfies ThreadListResponse);
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
    const parts = groupAvatarParts(thread.threadType, thread.threadId, thread.avatarUrl);
    // Đầu khung chat ghi "Nhóm · N thành viên" cho mọi nhóm, kể cả nhóm có ảnh riêng
    const memberCount =
      parts.memberCount ??
      (thread.threadType === "group"
        ? ((db.prepare("SELECT member_count FROM threads WHERE thread_id = ? AND thread_type = 'group'").get(thread.threadId) as
            | { member_count: number | null }
            | undefined)?.member_count ?? null)
        : null);
    return c.json({
      thread: { ...thread, ...parts, memberCount },
      messages: messages.map(toArchivedMessage),
    } satisfies ThreadMessagesResponse);
  });

  app.post("/threads/:threadId/pin", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { pinned?: unknown } | null;
    if (typeof body?.pinned !== "boolean") return c.json({ error: "pinned phải là true/false" }, 400);
    if (!setThreadPinned(db, c.req.param("threadId"), body.pinned, new Date().toISOString())) {
      return c.json({ error: "Không có hội thoại này" }, 404);
    }
    return c.json({ pinned: body.pinned });
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
      const thread = findThread(db, m.threadId);
      return {
        ...toArchivedMessage(m),
        threadName: label?.name ?? thread?.name ?? null,
        threadIsFriend: label?.isFriend ?? false,
        threadAvatarUrl: thread?.avatarUrl ?? null,
      };
    });
    return c.json({ messages: results } satisfies SearchResponse);
  });

  return app;
}
