import { Hono } from "hono";
import { startOfLocalDayDaysAgoUtc, startOfTodayUtc } from "../../shared/local-date-range.js";
import { listenerGaps, recentConnectionEvents } from "../../storage/connection-event-store.js";
import { HEARTBEAT_STALE_MS } from "../../storage/daemon-liveness.js";
import { findThread, listThreadsPage, readThread } from "../../storage/message-read-queries.js";
import { readThreadAfter, readThreadAround } from "../../storage/message-window-queries.js";
import { archiveTotals, countBy, dailyMessageCounts, topThreadsSince } from "../../storage/overview-stats-queries.js";
import { groupMosaicIfNoAvatar, lastMessagePreview } from "../../storage/thread-list-extras.js";
import { setThreadPinned } from "../../storage/thread-pin-store.js";
import { getMeta } from "../../storage/thread-directory-store.js";
import type { OverviewResponse, ThreadListResponse, ThreadMessagesResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toArchivedMessage } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Xem kho: tổng quan, hội thoại, tin (tìm kiếm: message-search-routes.ts, file media: media-file-route.ts) */
export function archiveBrowseRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db, env } = ctx;
  const tz = env.ARCHIVE_TIMEZONE;
  const groupAvatarParts = (type: string, id: string, avatarUrl: string | null) => groupMosaicIfNoAvatar(db, type, id, avatarUrl);

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
      // Dư ra để còn đủ dòng sau khi dashboard bỏ "Đăng nhập" (mỗi lần khởi động lại ghi 3 sự kiện)
      recentEvents: recentConnectionEvents(db, 40),
    };
    return c.json(body);
  });

  app.get("/threads", (c) => {
    const page = listThreadsPage(db, {
      query: c.req.query("query"),
      limit: clampInt(c.req.query("limit"), 50, 1, 200),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
      pinnedFirst: true,
      // Tab Nhóm / Bạn bè của hộp Chia sẻ
      kind: c.req.query("kind") === "group" ? "group" : c.req.query("kind") === "friend" ? "friend" : undefined,
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
    const id = (name: string) => clampInt(c.req.query(name), 0, 0, Number.MAX_SAFE_INTEGER);
    const ref = { threadId: thread.threadId, threadType: thread.threadType, limit: clampInt(c.req.query("limit"), 50, 1, 200) };
    // Nhảy tới một tin (kết quả tìm kiếm): một trang quanh tin đó; cuộn xuống: các tin mới hơn
    const messages = id("aroundId")
      ? readThreadAround(db, { ...ref, messageId: id("aroundId") })
      : id("afterId")
        ? readThreadAfter(db, { ...ref, afterId: id("afterId") })
        : readThread(db, { ...ref, beforeId: id("beforeId") || undefined });
    if (!messages) return c.json({ error: "Tin này không thuộc hội thoại" }, 404);
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

  return app;
}
