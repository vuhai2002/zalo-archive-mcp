import type { DatabaseSync } from "node:sqlite";
import type { ThreadSummary } from "../storage/message-read-queries.js";
import type { OutboxMention } from "../storage/outbox-store.js";

/**
 * Nhắc tên (@) trong tin gửi vào nhóm. Zalo chỉ tô xanh và báo cho người được nhắc khi tin mang danh sách
 * `[{ uid, pos, len }]` (vị trí + độ dài đoạn "@Tên" trong chữ, đơn vị ký tự JS - kiểm trên tin Zalo gửi về: "@Lã Văn
 * Khê" ở đầu tin là pos 0, len 11). Người gọi (Claude, dashboard) chỉ nói AI và đoạn chữ nào; kho tự tìm vị trí, để
 * không ai phải đếm ký tự. Chặn tag nhầm: người được nhắc phải là thành viên nhóm theo kho, hoặc đã nhắn trong nhóm
 * (nhóm đông Zalo không trả đủ danh sách thành viên). Mã người trong kho cùng loại mã Zalo dùng khi nhắc (đối chiếu
 * 08/11 trên tin nhắc tên Zalo gửi về).
 */
export type MentionRequest = { userId: string; text: string };
export const MAX_MENTIONS = 20;

export function resolveOutboxMentions(
  db: DatabaseSync,
  thread: ThreadSummary,
  text: string,
  requests: MentionRequest[] | undefined,
): OutboxMention[] | { error: string } {
  if (!requests || requests.length === 0) return [];
  if (thread.threadType !== "group") return { error: "Chỉ nhắc tên (@) được trong nhóm - Zalo không hỗ trợ nhắc tên trong tin 1-1." };
  if (requests.length > MAX_MENTIONS) return { error: `Tối đa ${MAX_MENTIONS} người được nhắc tên mỗi tin.` };
  const isMember = db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1");
  const hasPosted = db.prepare("SELECT 1 FROM messages WHERE thread_id = ? AND sender_id = ? LIMIT 1");
  const mentions: OutboxMention[] = [];
  let cursor = 0;
  for (const r of requests) {
    if (!/^\d+$/.test(r.userId)) return { error: `user_id "${r.userId}" không hợp lệ (phải là mã số người dùng Zalo).` };
    if (!r.text.startsWith("@") || r.text.length < 2) return { error: `Đoạn nhắc tên "${r.text}" phải bắt đầu bằng @ (vd "@Thanh").` };
    if (!isMember.get(thread.threadId, r.userId) && !hasPosted.get(thread.threadId, r.userId)) {
      return { error: `user_id=${r.userId} không phải thành viên nhóm này theo kho - không nhắc tên để tránh tag nhầm người.` };
    }
    const pos = text.indexOf(r.text, cursor);
    if (pos < 0) {
      return { error: `Không thấy "${r.text}" trong nội dung tin (sau chỗ nhắc trước đó) - liệt kê người được nhắc theo đúng thứ tự xuất hiện.` };
    }
    mentions.push({ uid: r.userId, pos, len: r.text.length });
    cursor = pos + r.text.length;
  }
  return mentions;
}
