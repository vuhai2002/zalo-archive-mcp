import type { ThreadKind } from "../../archive-api-types";

/**
 * "Tìm gần đây" như Zalo: các hội thoại vừa mở từ ô tìm kiếm, mới nhất trước, tối đa `MAX_RECENT`.
 * Chỉ là tiện ích theo trình duyệt (localStorage): hỏng hay bị chặn thì danh sách rỗng, không lỗi.
 */
export type RecentThread = { threadId: string; threadType: ThreadKind; name: string | null; avatarUrl: string | null };

export const MAX_RECENT = 10;
const KEY = "zalo-archive.recent-search-threads";

/** Đưa một hội thoại lên đầu (bỏ bản cũ của nó), cắt còn `max` mục. Hàm thuần */
export function pushRecent(list: RecentThread[], item: RecentThread, max = MAX_RECENT): RecentThread[] {
  return [item, ...list.filter((r) => r.threadId !== item.threadId)].slice(0, max);
}

const isRecent = (v: unknown): v is RecentThread => {
  const r = v as Partial<RecentThread> | null;
  return (
    typeof r?.threadId === "string" &&
    (r.threadType === "user" || r.threadType === "group") &&
    (r.name === null || typeof r.name === "string") &&
    (r.avatarUrl === null || typeof r.avatarUrl === "string")
  );
};

/** Đọc danh sách đã lưu; giá trị lạ (sửa tay, bản cũ) thì bỏ qua từng mục */
export function parseRecent(raw: string | null): RecentThread[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter(isRecent).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function loadRecentThreads(): RecentThread[] {
  try {
    return parseRecent(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

function save(list: RecentThread[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Trình duyệt chặn lưu: lần sau danh sách trống, không sao
  }
}

export function rememberRecentThread(item: RecentThread): void {
  save(pushRecent(loadRecentThreads(), item));
}

export function forgetRecentThread(threadId: string): RecentThread[] {
  const next = loadRecentThreads().filter((r) => r.threadId !== threadId);
  save(next);
  return next;
}
