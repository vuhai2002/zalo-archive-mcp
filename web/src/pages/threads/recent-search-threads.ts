import type { MemberAvatar, SearchResult, ThreadKind } from "../../archive-api-types";

/**
 * "Tìm gần đây" như Zalo: các hội thoại vừa mở từ ô tìm kiếm, mới nhất trước, tối đa `MAX_RECENT`.
 * Chỉ là tiện ích theo trình duyệt (localStorage): hỏng hay bị chặn thì danh sách rỗng, không lỗi.
 * Nhóm không có ảnh riêng lưu kèm vài thành viên (`memberAvatars`) để ghép avatar như danh sách hội thoại; mục lưu từ bản cũ
 * chưa có thì hiện chữ viết tắt tới lần mở lại.
 */
export type RecentThread = {
  threadId: string;
  threadType: ThreadKind;
  name: string | null;
  avatarUrl: string | null;
  memberAvatars?: MemberAvatar[];
  memberCount?: number | null;
};

/** Chỉ giữ các trường cần lưu của một hội thoại mở từ kết quả tìm (mục Liên hệ là cả dòng danh sách, không lưu hết) */
export const recentThreadOf = ({ threadId, threadType, name, avatarUrl, memberAvatars, memberCount }: RecentThread): RecentThread => ({
  threadId,
  threadType,
  name,
  avatarUrl,
  memberAvatars,
  memberCount,
});

/** Hội thoại của một tin vừa mở từ kết quả tìm, kèm thành viên để ghép avatar nhóm không có ảnh riêng */
export const recentThreadOfHit = (m: SearchResult): RecentThread => ({
  threadId: m.threadId,
  threadType: m.threadType,
  name: m.threadName,
  avatarUrl: m.threadAvatarUrl,
  memberAvatars: m.threadMemberAvatars,
  memberCount: m.threadMemberCount,
});

const isMemberAvatar = (v: unknown): v is MemberAvatar => {
  const a = v as Partial<MemberAvatar> | null;
  return typeof a?.userId === "string" && (a.name === null || typeof a.name === "string") && (a.avatarUrl === null || typeof a.avatarUrl === "string");
};

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
    (r.avatarUrl === null || typeof r.avatarUrl === "string") &&
    (r.memberAvatars === undefined || (Array.isArray(r.memberAvatars) && r.memberAvatars.every(isMemberAvatar))) &&
    (r.memberCount === undefined || r.memberCount === null || typeof r.memberCount === "number")
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

/** Mục nhóm không có ảnh riêng lưu từ bản cũ (chưa kèm thành viên): cần lấy lại để ghép avatar */
export const needsMemberAvatars = (r: RecentThread) => r.threadType === "group" && !r.avatarUrl && !r.memberAvatars?.length;

/** Thay một mục đã lưu bằng bản mới (giữ nguyên thứ tự); trả danh sách sau khi lưu */
export function updateRecentThread(item: RecentThread): RecentThread[] {
  const next = loadRecentThreads().map((r) => (r.threadId === item.threadId ? item : r));
  save(next);
  return next;
}

export function forgetRecentThread(threadId: string): RecentThread[] {
  const next = loadRecentThreads().filter((r) => r.threadId !== threadId);
  save(next);
  return next;
}
