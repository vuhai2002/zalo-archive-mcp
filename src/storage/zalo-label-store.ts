import type { DatabaseSync } from "node:sqlite";
import type { ThreadKind } from "../archive/archived-message-types.js";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Thẻ Phân loại mình gắn cho hội thoại trên Zalo (vd "NHÃN THỬ B", "Nhóm Sổ Tay Mẫu"). Kho chỉ ĐỌC từ Zalo (getLabels) để chọn
 * nhanh hội thoại cho chế độ trình chiếu, không bao giờ sửa thẻ trên Zalo. Danh sách nhỏ (vài thẻ) nên giữ nguyên bộ dạng
 * JSON trong bảng meta, mỗi lần đồng bộ thay cả bộ.
 */
export type ZaloLabel = {
  id: number;
  name: string;
  /** Màu Zalo gán cho thẻ, dạng "#rrggbb"; null nếu Zalo không gửi màu hợp lệ */
  color: string | null;
  emoji: string | null;
  conversations: Array<{ threadId: string; threadType: ThreadKind }>;
};

const LABELS_KEY = "zalo_labels_json";
const SYNCED_KEY = "zalo_labels_synced_at";

/** Mã hội thoại trong thẻ của Zalo: nhóm có tiền tố "g" ("g1234..."), người là id số trơn; mã lạ trả null */
export function parseLabelConversation(key: unknown): { threadId: string; threadType: ThreadKind } | null {
  const s = typeof key === "string" ? key.trim() : typeof key === "number" ? String(key) : "";
  const group = /^g(\d{1,25})$/.exec(s);
  if (group) return { threadId: group[1]!, threadType: "group" };
  return /^\d{1,25}$/.test(s) ? { threadId: s, threadType: "user" } : null;
}

/** Chuẩn hóa dữ liệu thẻ Zalo trả (dữ liệu ngoài, đọc phòng thủ): bỏ thẻ không tên, mã hội thoại lạ, trùng */
export function normalizeZaloLabels(raw: unknown): ZaloLabel[] {
  if (!Array.isArray(raw)) return [];
  const out: ZaloLabel[] = [];
  for (const l of raw as Array<Record<string, unknown>>) {
    const name = typeof l?.text === "string" ? l.text.trim() : "";
    const id = Number(l?.id);
    if (!name || !Number.isSafeInteger(id)) continue;
    const seen = new Set<string>();
    const conversations: ZaloLabel["conversations"] = [];
    for (const c of Array.isArray(l.conversations) ? l.conversations : []) {
      const p = parseLabelConversation(c);
      if (p && !seen.has(`${p.threadType}:${p.threadId}`)) {
        seen.add(`${p.threadType}:${p.threadId}`);
        conversations.push(p);
      }
    }
    const color = typeof l.color === "string" && /^#[0-9a-f]{6}$/i.test(l.color.trim()) ? l.color.trim() : null;
    const emoji = typeof l.emoji === "string" && l.emoji.trim() ? l.emoji.trim() : null;
    out.push({ id, name, color, emoji, conversations });
  }
  return out;
}

/** Thay cả bộ thẻ bằng bộ mới lấy từ Zalo */
export function replaceZaloLabels(db: DatabaseSync, labels: ZaloLabel[], at = new Date()): void {
  setMeta(db, LABELS_KEY, JSON.stringify(labels));
  setMeta(db, SYNCED_KEY, at.toISOString());
}

/** Bộ thẻ đã lưu (rỗng nếu chưa đồng bộ lần nào) + lúc đồng bộ gần nhất. Dữ liệu do chính kho ghi (đã chuẩn hóa) */
export function readZaloLabels(db: DatabaseSync): { labels: ZaloLabel[]; syncedAt: string | null } {
  let labels: ZaloLabel[] = [];
  try {
    const parsed: unknown = JSON.parse(getMeta(db, LABELS_KEY) ?? "[]");
    if (Array.isArray(parsed)) labels = parsed as ZaloLabel[];
  } catch {
    labels = [];
  }
  return { labels, syncedAt: getMeta(db, SYNCED_KEY) };
}
