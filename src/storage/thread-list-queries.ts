import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { myDocumentsThreadId } from "./my-documents-deletion-store.js";

export type ThreadSummary = {
  threadId: string;
  threadType: ThreadKind;
  name: string | null;
  avatarUrl: string | null;
  isFriend: boolean;
  /** Hội thoại My Documents của Zalo (cất đồ riêng): không phải "người lạ" */
  isMyDocuments: boolean;
  lastMessageAt: string | null;
  messageCount: number;
  /** Đã ghim lên đầu danh sách trên dashboard */
  pinned: boolean;
};

/**
 * Hội thoại kèm tên + avatar. Hội thoại 1-1: tên gợi nhớ mình đặt cho người đó (như Zalo PC) đứng
 * trước, rồi tên trong danh sách hội thoại / danh bạ; avatar lấy từ danh bạ người `contacts`. Nhóm:
 * lấy từ chính dòng `threads`. `other_name`: tên thật khi đang hiện tên gợi nhớ - tìm theo tên nào cũng ra.
 */
const THREAD_SELECT = `SELECT t.thread_id, t.thread_type, COALESCE(c.alias, t.name, c.display_name) AS name,
    COALESCE(t.name, c.display_name) AS other_name,
    COALESCE(t.avatar_url, c.avatar_url) AS avatar_url, t.is_friend, t.last_message_at, t.pinned_at
  FROM threads t LEFT JOIN contacts c ON t.thread_type = 'user' AND c.user_id = t.thread_id`;

/** Danh sách hội thoại, mới nhất trước. `query` lọc theo tên (bỏ dấu) hoặc đúng id. */
export function listThreads(db: DatabaseSync, opts: { query?: string; limit: number }): ThreadSummary[] {
  return listThreadsPage(db, { ...opts, offset: 0 }).threads;
}

/**
 * Như `listThreads` nhưng có phân trang và tổng số (cho dashboard). `pinnedFirst`: hội thoại đã ghim
 * lên đầu (ghim sau đứng trước) như danh sách Zalo - chỉ dashboard dùng, MCP vẫn mới nhất trước.
 *
 * Không có `query`: chỉ hội thoại ĐÃ có tin - bạn bè chưa từng nhắn (có hàng trăm
 * trên nick chính) không làm ngập danh sách. Có `query`: tìm cả họ, để gửi tin mới.
 */
/** Lọc danh sách hội thoại như các tab của hộp Chia sẻ Zalo: chỉ nhóm, hoặc chỉ bạn bè */
export type ThreadListKind = "group" | "friend";

export function listThreadsPage(
  db: DatabaseSync,
  opts: { query?: string; limit: number; offset: number; pinnedFirst?: boolean; kind?: ThreadListKind },
): { threads: ThreadSummary[]; total: number } {
  const raw = opts.query?.trim() ?? "";
  // Lọc tên bằng JS vì cần bỏ dấu cả hai phía; vài nghìn hội thoại vẫn nhanh.
  const rows = db
    .prepare(
      `${THREAD_SELECT} ${raw ? "" : "WHERE t.last_message_at IS NOT NULL"}
       ORDER BY ${opts.pinnedFirst ? "t.pinned_at IS NULL, t.pinned_at DESC," : ""} t.last_message_at IS NULL, t.last_message_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;

  const needle = foldVietnameseForSearch(raw);
  const ofKind = opts.kind ? rows.filter((r) => (opts.kind === "group" ? r.thread_type === "group" : r.thread_type === "user" && Number(r.is_friend) === 1)) : rows;
  const filtered = raw
    ? ofKind.filter(
        (r) =>
          r.thread_id === raw ||
          foldVietnameseForSearch(String(r.name ?? "")).includes(needle) ||
          foldVietnameseForSearch(String(r.other_name ?? "")).includes(needle),
      )
    : ofKind;
  const page = filtered.slice(opts.offset, opts.offset + opts.limit).map((r) => toThreadSummary(db, r));
  return { threads: page, total: filtered.length };
}

/** Hội thoại theo đúng id; null nếu kho chưa từng thấy hội thoại này */
export function findThread(db: DatabaseSync, threadId: string): ThreadSummary | null {
  const row = db.prepare(`${THREAD_SELECT} WHERE t.thread_id = ? ORDER BY t.last_message_at DESC LIMIT 1`).get(threadId) as
    | Record<string, unknown>
    | undefined;
  return row ? toThreadSummary(db, row) : null;
}

function toThreadSummary(db: DatabaseSync, r: Record<string, unknown>): ThreadSummary {
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE thread_id = ? AND thread_type = ?")
    .get(String(r.thread_id), String(r.thread_type)) as { n: number };
  return {
    threadId: String(r.thread_id),
    threadType: r.thread_type as ThreadKind,
    name: (r.name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isFriend: r.is_friend === 1,
    isMyDocuments: r.thread_type === "user" && String(r.thread_id) === myDocumentsThreadId(db),
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    messageCount: Number(count.n),
    pinned: r.pinned_at !== null && r.pinned_at !== undefined,
  };
}
