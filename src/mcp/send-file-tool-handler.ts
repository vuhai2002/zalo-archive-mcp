import fs from "node:fs";
import { resolveDataDir } from "../config/account-paths.js";
import { enqueueSingle, READ_ONLY_ERROR } from "../outbox/enqueue-outbox-request.js";
import { resolveOutboxFiles } from "../outbox/resolve-outbox-files.js";
import { stageFilesForLater, sweepStagedFiles } from "../outbox/stage-scheduled-outbox-files.js";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";
import { formattedText, toMentions, type MentionArg, type SendToolContext } from "./outbox-send-tool-handlers.js";
import { sendNowAndAwait } from "./send-now-and-await.js";
import { formatLocalTime } from "./format-messages-for-model.js";
import { toolError, toolOk, type ToolResult } from "./tool-result.js";

/** Tải file lên Zalo lâu hơn gửi chữ: chờ daemon lâu hơn */
const DEFAULT_WAIT_MS = 180_000;

export type SendFileArgs = {
  thread_id: string;
  file_paths?: string[];
  attachment_ids?: number[];
  text?: string;
  mentions?: MentionArg[];
  reply_to?: number;
  /** Gửi mọi file thành thẻ file, kể cả ảnh / video (như nút Đính kèm File của Zalo); mặc định ảnh thành ảnh / chùm ảnh */
  as_file?: boolean;
  /** Hẹn giờ: cả hai cùng có thì xếp hẹn giờ thay vì gửi ngay */
  send_date?: string;
  send_time?: string;
  note?: string;
};

const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const describeFiles = (files: OutboxFile[]) => files.map((f) => `${f.name} (${sizeText(f.size)})`).join(", ");

/**
 * Lệnh `send_file`: gửi file / ảnh / video (kèm chữ nếu có) tới một hội thoại, CHỈ khi người dùng bảo và đã duyệt danh sách
 * file + nội dung (người dùng chốt 2026-11-09). Lệnh đánh dấu phá hủy nên Claude Code / Claude Desktop hỏi duyệt mỗi lần.
 * File bí mật (.env, khóa, mật khẩu) và dữ liệu nội bộ của kho bị chặn cứng. Có send_date + send_time thì hẹn giờ: chép
 * file ngoài kho vào chỗ riêng của nick rồi xếp mục hẹn giờ, daemon gửi đúng giờ theo thứ tự ảnh, file, chữ như gửi ngay.
 */
export async function sendFileTool(ctx: SendToolContext, args: SendFileArgs): Promise<ToolResult> {
  if (!ctx.mediaRoot) return toolError("Chưa có nick Zalo nào để gửi file.");
  const resolved = resolveOutboxFiles(
    ctx.db,
    { mediaRoot: ctx.mediaRoot, dataDir: resolveDataDir(ctx.env) },
    { paths: args.file_paths, attachmentIds: args.attachment_ids },
  );
  if ("error" in resolved) return toolError(resolved.error);
  // as_file: ảnh / video cũng đi thành thẻ file (daemon gắn cờ asFile của bản vá zca-js cho các đuôi này)
  const files = args.as_file ? resolved.files.map((f) => ({ ...f, kind: "file" as const })) : resolved.files;
  if (args.send_date !== undefined || args.send_time !== undefined) return scheduleFiles(ctx, args, files);
  return sendNowAndAwait(
    ctx,
    { threadId: args.thread_id, ...formattedText(args.text ?? ""), files, mentions: toMentions(args.mentions), replyToMessageId: args.reply_to },
    {
      defaultWaitMs: DEFAULT_WAIT_MS,
      describe: (item) => `Đã gửi ${files.length} file tới thread_id=${item.threadId}: ${describeFiles(files)}${item.text ? `, kèm chữ "${item.text.slice(0, 80)}"` : ""}`,
    },
  );
}

/** Hẹn giờ gửi file: kiểm đủ ngày giờ, chép file ngoài kho, xếp mục hẹn giờ; xếp không được thì xóa bản chép vừa tạo */
function scheduleFiles(ctx: SendToolContext, args: SendFileArgs, files: OutboxFile[]): ToolResult {
  if (!args.send_date || !args.send_time) return toolError("Hẹn giờ cần đủ send_date (YYYY-MM-DD) và send_time (HH:mm).");
  if (ctx.readOnly) return toolError(READ_ONLY_ERROR);
  if (!ctx.outboxFilesDir || !ctx.mediaRoot) return toolError("Chưa có chỗ cất file hẹn giờ của nick này.");
  sweepStagedFiles(ctx.db, ctx.outboxFilesDir);
  let staged: ReturnType<typeof stageFilesForLater>;
  try {
    staged = stageFilesForLater(files, { mediaRoot: ctx.mediaRoot, stagingDir: ctx.outboxFilesDir });
  } catch (err) {
    return toolError(`Không chép được file để hẹn giờ: ${String((err as Error).message ?? err)}`);
  }
  const r = enqueueSingle(ctx, {
    threadId: args.thread_id,
    ...formattedText(args.text ?? ""),
    files: staged.files,
    mentions: toMentions(args.mentions),
    replyToMessageId: args.reply_to,
    when: "schedule",
    sendDate: args.send_date,
    sendTime: args.send_time,
    note: args.note,
    createdBy: "mcp",
  });
  if (!r.ok) {
    if (staged.stagedDir) fs.rmSync(staged.stagedDir, { recursive: true, force: true });
    return toolError(r.error);
  }
  const at = formatLocalTime(r.notBefore, ctx.env.ARCHIVE_TIMEZONE);
  const text = args.text?.trim() ? `, rồi chữ "${args.text.trim().slice(0, 80)}"` : "";
  return toolOk(
    `Đã hẹn gửi mục #${r.ids[0]} lúc ${at} (giờ ${ctx.env.ARCHIVE_TIMEZONE}) tới thread_id=${args.thread_id}: ${files.length} file ` +
      `(${describeFiles(files)})${text}. Daemon tự gửi đúng giờ (ảnh / file trước, chữ sau); xem hoặc hủy bằng list_outbox / cancel_outbox.`,
  );
}
