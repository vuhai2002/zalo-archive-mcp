import { resolveDataDir } from "../config/account-paths.js";
import { resolveOutboxFiles } from "../outbox/resolve-outbox-files.js";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";
import { toMentions, type MentionArg, type SendToolContext } from "./outbox-send-tool-handlers.js";
import { sendNowAndAwait } from "./send-now-and-await.js";
import { toolError, type ToolResult } from "./tool-result.js";

/** Tải file lên Zalo lâu hơn gửi chữ: chờ daemon lâu hơn */
const DEFAULT_WAIT_MS = 180_000;

export type SendFileArgs = {
  thread_id: string;
  file_paths?: string[];
  attachment_ids?: number[];
  text?: string;
  mentions?: MentionArg[];
  reply_to?: number;
};

const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const describeFiles = (files: OutboxFile[]) => files.map((f) => `${f.name} (${sizeText(f.size)})`).join(", ");

/**
 * Lệnh `send_file`: gửi file / ảnh / video (kèm chữ nếu có) tới một hội thoại, CHỈ khi người dùng bảo và đã duyệt danh sách
 * file + nội dung (người dùng chốt 2026-11-09). Lệnh đánh dấu phá hủy nên Claude Code / Claude Desktop hỏi duyệt mỗi lần.
 * File bí mật (.env, khóa, mật khẩu) và dữ liệu nội bộ của kho bị chặn cứng.
 */
export async function sendFileTool(ctx: SendToolContext, args: SendFileArgs): Promise<ToolResult> {
  if (!ctx.mediaRoot) return toolError("Chưa có nick Zalo nào để gửi file.");
  const resolved = resolveOutboxFiles(
    ctx.db,
    { mediaRoot: ctx.mediaRoot, dataDir: resolveDataDir(ctx.env) },
    { paths: args.file_paths, attachmentIds: args.attachment_ids },
  );
  if ("error" in resolved) return toolError(resolved.error);
  const files = resolved.files;
  return sendNowAndAwait(
    ctx,
    { threadId: args.thread_id, text: args.text ?? "", files, mentions: toMentions(args.mentions), replyToMessageId: args.reply_to },
    {
      defaultWaitMs: DEFAULT_WAIT_MS,
      describe: (item) => `Đã gửi ${files.length} file tới thread_id=${item.threadId}: ${describeFiles(files)}${item.text ? `, kèm chữ "${item.text.slice(0, 80)}"` : ""}`,
    },
  );
}
