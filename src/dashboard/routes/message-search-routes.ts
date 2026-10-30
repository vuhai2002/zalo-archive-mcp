import { Hono } from "hono";
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from "../../shared/local-date-range.js";
import { findThread } from "../../storage/message-read-queries.js";
import type { MessageRow } from "../../storage/message-row-mapping.js";
import {
  listMessagesMentioningMe,
  listMyMessagesWithReactions,
  searchMessages,
  threadSenders,
} from "../../storage/message-search-queries.js";
import { getMeta, threadLabel } from "../../storage/thread-directory-store.js";
import type { SearchResponse, ThreadSendersResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toArchivedMessage } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/**
 * Tìm tin cho dashboard: tìm chung (cột trái), tìm trong một hội thoại (bảng bên phải, lọc người gửi /
 * ngày gửi), bộ lọc "Nhắc bạn" / "Biểu cảm", và danh sách người gửi của một hội thoại.
 */
export function messageSearchRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db, env } = ctx;
  const tz = env.ARCHIVE_TIMEZONE;

  /** Kèm tên + avatar hội thoại cho mỗi tin (kết quả tìm chung lẫn nhiều hội thoại) */
  const withThreadInfo = (messages: MessageRow[]): SearchResponse => ({
    messages: messages.map((m) => {
      const label = threadLabel(db, m.threadId);
      const thread = findThread(db, m.threadId);
      return {
        ...toArchivedMessage(m),
        threadName: label?.name ?? thread?.name ?? null,
        threadIsFriend: label?.isFriend ?? false,
        threadAvatarUrl: thread?.avatarUrl ?? null,
      };
    }),
  });

  app.get("/search", (c) => {
    const limit = clampInt(c.req.query("limit"), 50, 1, 200);
    const offset = clampInt(c.req.query("offset"), 0, 0, 100_000);
    const filter = c.req.query("filter");
    if (filter === "mentions" || filter === "reactions") {
      const selfUid = getMeta(db, "self_uid");
      const list = filter === "mentions" ? listMessagesMentioningMe : listMyMessagesWithReactions;
      return c.json(withThreadInfo(list(db, { selfUid, limit, offset })));
    }
    if (filter) return c.json({ error: "filter phải là mentions hoặc reactions" }, 400);

    const fromDate = c.req.query("fromDate");
    const toDate = c.req.query("toDate");
    const fromIso = fromDate ? startOfLocalDayUtc(fromDate, tz) : undefined;
    const toIso = toDate ? startOfNextLocalDayUtc(toDate, tz) : undefined;
    if (fromIso === null || toIso === null) return c.json({ error: "Ngày phải dạng YYYY-MM-DD" }, 400);
    const files = c.req.query("files");
    if (files !== undefined && files !== "only" && files !== "exclude") return c.json({ error: "files phải là only hoặc exclude" }, 400);
    const messages = searchMessages(db, {
      query: c.req.query("q"),
      threadId: c.req.query("threadId") || undefined,
      senderId: c.req.query("senderId") || undefined,
      fromIso,
      toIso,
      files,
      limit,
      offset,
    });
    return c.json(withThreadInfo(messages));
  });

  app.get("/threads/:threadId/senders", (c) => {
    const thread = findThread(db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    return c.json({ senders: threadSenders(db, thread.threadId) } satisfies ThreadSendersResponse);
  });

  return app;
}
