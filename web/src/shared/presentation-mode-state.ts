import { foldForSearch } from "./fold-for-search";

/**
 * Chế độ trình chiếu (chia sẻ màn hình lúc thuyết trình): danh sách hội thoại chỉ còn các hội thoại chọn sẵn, hội thoại khác ẩn
 * hết. Trạng thái nhớ trong trình duyệt (localStorage) để tải lại trang vẫn đang trình chiếu. Thoát là quên luôn danh sách
 * (người dùng chốt 2026-11-11): lần sau bật lại chọn từ đầu. Module thuần.
 */
export type PresentationState = { active: boolean; threadIds: string[] };

export const PRESENTATION_STORAGE_KEY = "kho.presentation-mode";
/** Trần số hội thoại trong danh sách trình chiếu (khớp trần 200 id của GET /api/threads?ids=, chừa dư) */
export const MAX_PRESENTATION_THREADS = 100;
/** Đang trình chiếu, ô tìm để thêm hội thoại chỉ ra kết quả khi gõ từ chừng này chữ: gõ 1-2 chữ không làm lộ cả loạt tên */
export const MIN_ADD_SEARCH_CHARS = 3;
/** Số kết quả tối đa của ô tìm để thêm */
export const MAX_ADD_SEARCH_RESULTS = 5;

export const EMPTY_PRESENTATION: PresentationState = { active: false, threadIds: [] };

const validIds = (ids: unknown): string[] =>
  Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && /^\d{1,25}$/.test(x)))].slice(0, MAX_PRESENTATION_THREADS) : [];

/**
 * Đọc trạng thái đã lưu (dữ liệu trình duyệt, đọc phòng thủ); hỏng thì về mặc định. Chỉ giữ danh sách khi đang trình chiếu
 * và còn hội thoại: không trình chiếu thì không nhớ lựa chọn nào (kể cả danh sách bản cũ để lại sau khi thoát).
 */
export function parsePresentationState(raw: string | null): PresentationState {
  try {
    const v = JSON.parse(raw ?? "null") as { active?: unknown; threadIds?: unknown } | null;
    const threadIds = validIds(v?.threadIds);
    return v?.active === true && threadIds.length > 0 ? { active: true, threadIds } : EMPTY_PRESENTATION;
  } catch {
    return EMPTY_PRESENTATION;
  }
}

/** Thêm một hội thoại vào danh sách đang trình chiếu (gặp tình huống bất ngờ); đủ trần thì giữ nguyên */
export function withThreadAdded(s: PresentationState, threadId: string): PresentationState {
  if (s.threadIds.includes(threadId) || s.threadIds.length >= MAX_PRESENTATION_THREADS) return s;
  return { ...s, threadIds: [...s.threadIds, threadId] };
}

/** Chữ gõ ở ô tìm để thêm đã đủ dài để hỏi kho chưa (đếm theo chữ đã bỏ dấu, bỏ khoảng trắng hai đầu) */
export const canSearchToAdd = (query: string): boolean => foldForSearch(query.trim()).length >= MIN_ADD_SEARCH_CHARS;
