import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { findThread } from "../storage/message-read-queries.js";
import { threadMembers } from "../storage/thread-links-and-members-queries.js";
import type { ReadToolContext } from "./archive-read-tool-handlers.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";
import { wrapUntrustedContent } from "./wrap-untrusted-content.js";

/** Nhóm đông nhất Zalo cho phép vài nghìn người: lấy hết một lượt rồi lọc theo tên bằng JS (bỏ dấu hai phía) */
const ALL_MEMBERS = 10_000;

/**
 * Lệnh `list_group_members`: thành viên một nhóm (mã người + tên) - để nhắc tên (@) người chưa từng nhắn trong nhóm, hay
 * biết ai trong nhóm. Lọc theo tên không dấu. Nhóm đông thì kho chỉ hỏi hồ sơ người đã nhắn nên nhiều người chưa có tên.
 */
export function listGroupMembersTool(ctx: ReadToolContext, args: { thread_id: string; query?: string; limit?: number }): ToolResult {
  const thread = findThread(ctx.db, args.thread_id);
  if (!thread) return toolError(`Không thấy hội thoại thread_id=${args.thread_id} trong kho.`);
  if (thread.threadType !== "group") return toolError("Đây là hội thoại 1-1, không có danh sách thành viên.");
  const { members, total } = threadMembers(ctx.db, { groupId: thread.threadId, limit: ALL_MEMBERS, offset: 0 });
  if (members.length === 0) return toolOk(`Kho chưa có danh sách thành viên của nhóm này (Zalo báo ${total} người).`);
  const needle = foldVietnameseForSearch(args.query?.trim() ?? "");
  const matched = needle ? members.filter((m) => m.name && foldVietnameseForSearch(m.name).includes(needle)) : members;
  const shown = matched.slice(0, args.limit ?? 100);
  const lines = shown.map((m) => `- ${m.name ?? "(chưa rõ tên)"}${m.isSelf ? " (Tôi)" : ""} | user_id=${m.userId}`);
  const head = `Nhóm thread_id=${thread.threadId}: kho biết ${members.length}/${total} thành viên; ${needle ? `${matched.length} người khớp "${args.query}", ` : ""}hiện ${shown.length}.`;
  // Tên do người khác tự đặt: bọc như nội dung tin
  return toolOk(`${head}\n${wrapUntrustedContent(lines.join("\n"), `thành viên nhóm ${thread.threadId}`)}`);
}
