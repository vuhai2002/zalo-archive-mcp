import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { BACKUP_NAME, storageSummaryState } from "../../archive/archive-storage-summary.js";
import { MAX_REMOVE_ATTACHMENTS, MAX_REMOVE_THREADS, previewRemoval, removeAttachmentFiles, type RemovalTarget } from "../../archive/remove-attachment-files.js";
import { findThread } from "../../storage/message-read-queries.js";
import { storedMediaFiles, threadsByMediaSize, type FileTab, type StoredMediaFile, type ThreadSizeSort } from "../../storage/storage-browse-queries.js";
import { groupMosaicIfNoAvatar } from "../../storage/thread-list-extras.js";
import type { DashboardContext } from "../dashboard-context.js";
import { mediaUrl } from "../dashboard-dto-mappers.js";
import type { StorageFile, StorageFilesResponse, StorageOverviewResponse, StorageRemoveRequest, StorageTab, StorageThreadsResponse } from "../storage-management-contract.js";
import { removePathSync } from "../../shared/remove-path-sync.js";

const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};
const TABS = new Set<FileTab>(["all", "photo", "video", "file", "voice"]);
const SORTS = new Set<ThreadSizeSort>(["size", "newest", "oldest"]);

/** Ngăn đọc / xóa nhầm: số đính kèm nguyên dương, mã hội thoại là chữ số, không quá trần mỗi lần */
function parseTarget(body: Partial<StorageRemoveRequest> | null): RemovalTarget | string {
  const ids = body?.attachmentIds ?? [];
  const threads = body?.threadIds ?? [];
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "number" && Number.isInteger(x) && x > 0)) return "attachmentIds phải là số đính kèm";
  if (!Array.isArray(threads) || !threads.every((x) => typeof x === "string" && /^[\w-]{1,64}$/.test(x))) return "threadIds phải là mã hội thoại";
  if (ids.length === 0 && threads.length === 0) return "Chưa chọn gì để xóa";
  if (ids.length > MAX_REMOVE_ATTACHMENTS) return `Mỗi lần tối đa ${MAX_REMOVE_ATTACHMENTS} file`;
  if (threads.length > MAX_REMOVE_THREADS) return `Mỗi lần tối đa ${MAX_REMOVE_THREADS} hội thoại`;
  return { attachmentIds: ids, threadIds: threads };
}

/**
 * Mục Quản lý dữ liệu (Cài đặt): dung lượng kho + ổ đĩa, hội thoại theo dung lượng file, lưới file, xóa FILE giữ tin, xóa bản sao
 * DB cũ. Chỉ đụng dữ liệu trên máy (không gọi Zalo) nên nick Chỉ đọc vẫn dùng được.
 */
export function storageManagementRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db } = ctx;
  const threadName = (id: string) => findThread(db, id)?.name ?? null;
  const toFile = (f: StoredMediaFile, names: Map<string, string | null>): StorageFile => {
    if (!names.has(f.threadId)) names.set(f.threadId, threadName(f.threadId));
    return { ...f, kind: f.kind as StorageFile["kind"], url: mediaUrl(f), threadName: names.get(f.threadId) ?? null };
  };

  const overview = (refresh: boolean): StorageOverviewResponse => {
    const state = storageSummaryState(db, ctx.paths, { refresh });
    const byKind = (["photo", "video", "file", "voice"] as const).map((tab) => {
      const r = storedMediaFiles(db, { tab, bigOnly: false, sort: "size", limit: 1, offset: 0 });
      return { kind: tab as StorageTab, files: r.total, bytes: r.totalBytes };
    });
    const big = storedMediaFiles(db, { tab: "all", bigOnly: true, sort: "size", limit: 4, offset: 0 });
    const names = new Map<string, string | null>();
    return {
      location: ctx.paths.root,
      disk: state.summary,
      computing: state.computing,
      byKind,
      bigFiles: { files: big.total, bytes: big.totalBytes, preview: big.items.map((f) => toFile(f, names)) },
    };
  };

  app.get("/storage", (c) => c.json(overview(c.req.query("refresh") === "1") satisfies StorageOverviewResponse));

  app.get("/storage/threads", (c) => {
    const sort = c.req.query("sort") as ThreadSizeSort;
    const page = threadsByMediaSize(db, {
      sort: SORTS.has(sort) ? sort : "size",
      query: c.req.query("query"),
      limit: clampInt(c.req.query("limit"), 50, 1, 200),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    const items = page.items.map(({ thread: t, files, bytes, lastAt }) => ({
      threadId: t.threadId,
      threadType: t.threadType,
      name: t.name,
      avatarUrl: t.avatarUrl,
      ...groupMosaicIfNoAvatar(db, t.threadType, t.threadId, t.avatarUrl),
      files,
      bytes,
      lastAt,
    }));
    return c.json({ items, total: page.total } satisfies StorageThreadsResponse);
  });

  app.get("/storage/files", (c) => {
    const tab = c.req.query("tab") as FileTab;
    const thread = c.req.query("thread");
    const page = storedMediaFiles(db, {
      threadId: thread && /^[\w-]{1,64}$/.test(thread) ? thread : undefined,
      tab: TABS.has(tab) ? tab : "all",
      bigOnly: c.req.query("big") === "1",
      sort: c.req.query("sort") === "newest" ? "newest" : "size",
      limit: clampInt(c.req.query("limit"), 60, 1, 200),
      offset: clampInt(c.req.query("offset"), 0, 0, 1_000_000),
    });
    const names = new Map<string, string | null>();
    return c.json({ items: page.items.map((f) => toFile(f, names)), total: page.total, totalBytes: page.totalBytes } satisfies StorageFilesResponse);
  });

  const target = async (req: Request) => parseTarget((await req.json().catch(() => null)) as Partial<StorageRemoveRequest> | null);

  app.post("/storage/remove-preview", async (c) => {
    const t = await target(c.req.raw);
    if (typeof t === "string") return c.json({ error: t }, 400);
    return c.json(previewRemoval(db, t));
  });

  app.post("/storage/remove", async (c) => {
    const t = await target(c.req.raw);
    if (typeof t === "string") return c.json({ error: t }, 400);
    const r = removeAttachmentFiles(db, ctx.paths.mediaDir, t);
    // Dung lượng ổ vừa đổi: đo lại ở nền
    storageSummaryState(db, ctx.paths, { refresh: true });
    return c.json(r);
  });

  // Bản sao DB cũ (archive-*.db) cạnh archive.db: xóa hẳn để lấy chỗ, chỉ nhận đúng tên bản sao đang có
  app.post("/storage/backups/delete", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { names?: unknown } | null;
    const names = body?.names;
    if (!Array.isArray(names) || names.length === 0 || !names.every((n) => typeof n === "string" && BACKUP_NAME.test(n))) {
      return c.json({ error: "Tên bản sao không hợp lệ" }, 400);
    }
    for (const name of names as string[]) {
      const file = path.join(ctx.paths.root, name);
      if (path.dirname(file) !== path.resolve(ctx.paths.root) || !fs.existsSync(file)) return c.json({ error: `Không có bản sao ${name}` }, 404);
    }
    for (const name of names as string[]) removePathSync(path.join(ctx.paths.root, name), { force: true });
    return c.json(overview(true) satisfies StorageOverviewResponse);
  });

  return app;
}
