import type { DatabaseSync } from "node:sqlite";
import { videoInfoOf } from "../archive/zalo-video-info.js";
import { mediaFamilyRange } from "../media/remove-orphan-media-files.js";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { CLEANABLE_KINDS } from "./attachment-file-removal-store.js";
import { findThread, type ThreadSummary } from "./message-read-queries.js";

/**
 * Duyệt dung lượng kho cho mục Quản lý dữ liệu (như "Dữ liệu trò chuyện" của Zalo): hội thoại xếp theo dung lượng file đã
 * tải, và lưới file của một hội thoại / file lớn của cả kho. Chỉ đính kèm đã tải (`done`), bỏ sticker.
 */
const KIND_LIST = CLEANABLE_KINDS.map((k) => `'${k}'`).join(", ");
/** Mốc "file lớn" như Zalo điện thoại */
export const BIG_FILE_BYTES = 5 * 1024 * 1024;

export type ThreadSizeSort = "size" | "newest" | "oldest";
export type ThreadMediaSize = { thread: ThreadSummary; files: number; bytes: number; lastAt: string };

/** Hội thoại có file đã tải, xếp theo dung lượng / file mới nhất / file cũ nhất; lọc theo tên không dấu */
export function threadsByMediaSize(
  db: DatabaseSync,
  q: { sort: ThreadSizeSort; query?: string; limit: number; offset: number },
): { items: ThreadMediaSize[]; total: number } {
  const rows = db
    .prepare(
      // Một file gửi lại nhiều lần trong cùng hội thoại chỉ chiếm một chỗ trên ổ: tính dung lượng mỗi file một lần
      `SELECT thread_id, SUM(c) AS files, COALESCE(SUM(sz), 0) AS bytes, MAX(last_at) AS last_at FROM (
         SELECT m.thread_id, COUNT(*) AS c, MAX(a.size_bytes) AS sz, MAX(m.sent_at) AS last_at
         FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
         WHERE a.status = 'done' AND a.local_path IS NOT NULL AND a.kind IN (${KIND_LIST})
         GROUP BY m.thread_id, a.local_path)
       GROUP BY thread_id`,
    )
    .all() as Array<{ thread_id: string; files: number; bytes: number; last_at: string }>;
  const needle = foldVietnameseForSearch(q.query?.trim() ?? "");
  const named = rows
    .map((r) => ({ r, thread: findThread(db, r.thread_id) }))
    .filter((x): x is { r: (typeof rows)[number]; thread: ThreadSummary } => x.thread !== null)
    .filter((x) => !needle || foldVietnameseForSearch(x.thread.name ?? "").includes(needle));
  const order: Record<ThreadSizeSort, (a: (typeof named)[number], b: (typeof named)[number]) => number> = {
    size: (a, b) => b.r.bytes - a.r.bytes,
    newest: (a, b) => b.r.last_at.localeCompare(a.r.last_at),
    oldest: (a, b) => a.r.last_at.localeCompare(b.r.last_at),
  };
  named.sort(order[q.sort]);
  return {
    total: named.length,
    items: named.slice(q.offset, q.offset + q.limit).map((x) => ({ thread: x.thread, files: Number(x.r.files), bytes: Number(x.r.bytes), lastAt: x.r.last_at })),
  };
}

export type FileTab = "all" | "photo" | "video" | "file" | "voice";
const TAB_KINDS: Record<FileTab, readonly string[]> = {
  all: CLEANABLE_KINDS,
  photo: ["photo", "gif"],
  video: ["video"],
  file: ["file"],
  voice: ["voice"],
};

export type StoredMediaFile = {
  id: number;
  kind: string;
  fileName: string | null;
  sizeBytes: number;
  mime: string | null;
  sha256: string | null;
  sentAt: string;
  messageId: number;
  threadId: string;
  durationMs: number | null;
  /** Số tin khác cũng dùng đúng file này trên ổ: xóa ở đây thì ổ chưa trống ra */
  sharedWith: number;
};

/** File đã tải của một hội thoại hoặc cả kho, theo tab; chỉ file lớn hơn 5 MB nếu `bigOnly`. Lớn nhất trước hoặc mới nhất trước */
export function storedMediaFiles(
  db: DatabaseSync,
  q: { threadId?: string; tab: FileTab; bigOnly: boolean; sort: "size" | "newest"; limit: number; offset: number },
): { items: StoredMediaFile[]; total: number; totalBytes: number } {
  const kinds = TAB_KINDS[q.tab].map((k) => `'${k}'`).join(", ");
  const where = `FROM attachments a JOIN messages m ON m.msg_id = a.msg_id
    WHERE a.status = 'done' AND a.local_path IS NOT NULL AND a.kind IN (${kinds})
    ${q.threadId ? "AND m.thread_id = :threadId" : ""} ${q.bigOnly ? `AND a.size_bytes > ${BIG_FILE_BYTES}` : ""}`;
  // node:sqlite từ chối tham số thừa: chỉ truyền threadId khi SQL dùng nó
  const params: Record<string, string> = q.threadId ? { threadId: q.threadId } : {};
  // Đếm theo tin, nhưng dung lượng tính MỖI FILE MỘT LẦN: file dùng chung giữa nhiều tin (chuyển tiếp qua nhiều nhóm) chỉ chiếm
  // một chỗ trên ổ - cộng thẳng thì tổng vượt cả dung lượng thật
  const agg = db
    .prepare(`SELECT COALESCE(SUM(c), 0) AS n, COALESCE(SUM(sz), 0) AS b FROM (SELECT COUNT(*) AS c, MAX(a.size_bytes) AS sz ${where} GROUP BY a.local_path)`)
    .get(params) as { n: number; b: number };
  const order = q.sort === "size" ? "a.size_bytes DESC, a.id DESC" : "m.sent_at DESC, a.id DESC";
  const rows = db
    .prepare(
      `SELECT a.id, a.kind, a.file_name, a.size_bytes, a.mime, a.sha256, a.local_path, m.sent_at, m.id AS message_id, m.thread_id,
         CASE WHEN a.kind = 'video' AND json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.content.params') END AS video_params
       ${where} ORDER BY ${order} LIMIT :limit OFFSET :offset`,
    )
    .all({ ...params, limit: q.limit, offset: q.offset }) as Array<Record<string, unknown>>;
  const family = db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE local_path = ? OR (local_path >= ? AND local_path < ?)");
  return {
    total: Number(agg.n),
    totalBytes: Number(agg.b),
    items: rows.map((r) => {
      const fam = mediaFamilyRange(String(r.local_path));
      const users = (family.get(fam.exact, fam.from, fam.to) as { n: number }).n;
      return {
        id: Number(r.id),
        kind: String(r.kind),
        fileName: (r.file_name as string | null) ?? null,
        sizeBytes: Number(r.size_bytes ?? 0),
        mime: (r.mime as string | null) ?? null,
        sha256: (r.sha256 as string | null) ?? null,
        sentAt: String(r.sent_at),
        messageId: Number(r.message_id),
        threadId: String(r.thread_id),
        durationMs: r.video_params ? (videoInfoOf(r.video_params)?.durationMs ?? null) : null,
        sharedWith: Math.max(0, users - 1),
      };
    }),
  };
}
