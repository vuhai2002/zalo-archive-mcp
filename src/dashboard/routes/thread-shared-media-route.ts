import { Hono } from "hono";
import { findThread } from "../../storage/message-read-queries.js";
import { reactionSummaries } from "../../storage/message-reaction-store.js";
import { getMeta } from "../../storage/thread-directory-store.js";
import { threadSharedLinks, threadMembers } from "../../storage/thread-links-and-members-queries.js";
import { threadSharedMedia } from "../../storage/thread-shared-media-queries.js";
import type { ThreadLinksResponse, ThreadMembersResponse, ThreadSharedMediaResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toAttachmentInfo } from "../dashboard-dto-mappers.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Ảnh/video, file, link và thành viên của một hội thoại (bảng thông tin bên phải khung chat) */
export function threadSharedMediaRoute(ctx: DashboardContext): Hono {
  const app = new Hono();
  app.get("/threads/:threadId/shared", (c) => {
    const thread = findThread(ctx.db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    const kind = c.req.query("kind") === "file" ? "file" : "visual";
    const page = threadSharedMedia(ctx.db, {
      threadId: thread.threadId,
      threadType: thread.threadType,
      kind,
      limit: clampInt(c.req.query("limit"), 8, 1, 120),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    // Cảm xúc của tin chứa ảnh / video - cửa sổ xem ảnh hiện ở góc dưới như Zalo
    const reactions = reactionSummaries(ctx.db, page.items.map((a) => a.msgId), getMeta(ctx.db, "self_uid"));
    const items = page.items.map((a) => ({
      ...toAttachmentInfo(a),
      sentAt: a.sentAt,
      messageId: a.messageId,
      senderId: a.senderId,
      senderName: a.senderName,
      senderAvatarUrl: a.senderAvatarUrl,
      isSelf: a.isSelf,
      reactions: reactions.get(a.msgId) ?? [],
    }));
    return c.json({ items, total: page.total } satisfies ThreadSharedMediaResponse);
  });

  app.get("/threads/:threadId/links", (c) => {
    const thread = findThread(ctx.db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    const page = threadSharedLinks(ctx.db, {
      threadId: thread.threadId,
      threadType: thread.threadType,
      limit: clampInt(c.req.query("limit"), 10, 1, 100),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    return c.json(page satisfies ThreadLinksResponse);
  });

  app.get("/threads/:threadId/members", (c) => {
    const thread = findThread(ctx.db, c.req.param("threadId"));
    if (!thread) return c.json({ error: "Không có hội thoại này" }, 404);
    if (thread.threadType !== "group") return c.json({ members: [], total: 0 } satisfies ThreadMembersResponse);
    const page = threadMembers(ctx.db, {
      groupId: thread.threadId,
      limit: clampInt(c.req.query("limit"), 20, 1, 200),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    return c.json(page satisfies ThreadMembersResponse);
  });
  return app;
}
