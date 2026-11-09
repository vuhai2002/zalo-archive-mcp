import { randomUUID } from "node:crypto";
import { linkPreviewOf } from "../archive/zalo-link-preview.js";
import { inTransaction } from "../shared/db-transaction.js";
import { containsUnsafeControlChars } from "../shared/terminal-safe-text.js";
import { findThread, type ThreadSummary } from "../storage/message-read-queries.js";
import { enqueueOutboxItem, type OutboxCreator } from "../storage/outbox-store.js";
import { MAX_TEXT_LENGTH, READ_ONLY_ERROR, type EnqueueContext, type EnqueueResult } from "./enqueue-outbox-request.js";

/**
 * Chuyển tiếp (Chia sẻ) một tin tới nhiều hội thoại, như hộp "Chia sẻ" của Zalo: tối đa 100 nơi mỗi lần, bạn bè lẫn
 * nhóm (người dùng chốt 09/11/2026), kèm lời nhắn tùy chọn. Mỗi nơi nhận là MỘT mục riêng trong hàng đợi (cùng mã nhóm
 * `batch_id`), daemon gửi lần lượt theo nhịp tin lẻ, qua kill switch như mọi tin; lời nhắn là tin chữ thường đi ngay sau.
 * Chỉ chuyển tiếp được tin chữ và link: zca-js `forwardMessage` chỉ gửi chữ (ảnh / file cần tải lên lại - chưa làm).
 */
export const MAX_FORWARD_TARGETS = 100;
const NOT_FORWARDABLE = "Kho chỉ chuyển tiếp được tin chữ và link (chưa chuyển tiếp được ảnh, video, file, sticker).";

type SourceRow = { id: number; msg_type: string; text: string | null; recalled_at: string | null; raw_json: string | null };

function contentOf(raw: string | null): unknown {
  try {
    return raw ? (JSON.parse(raw) as { content?: unknown }).content : undefined;
  } catch {
    return undefined;
  }
}

/** Chữ sẽ chuyển tiếp: tin chữ thì đúng chữ gốc (tin dài Zalo lưu dạng { title }); tin link thì chữ của tin (chứa link) */
export function forwardableText(row: Pick<SourceRow, "msg_type" | "text" | "raw_json">): string | null {
  const content = contentOf(row.raw_json);
  if (row.msg_type === "webchat") {
    const title = content && typeof content === "object" ? (content as Record<string, unknown>).title : null;
    const text = typeof content === "string" ? content : typeof title === "string" ? title : (row.text ?? "");
    return text.trim() ? text : null;
  }
  if (row.msg_type === "chat.recommended") return linkPreviewOf(content)?.text ?? null;
  return null;
}

export type ForwardRequest = { messageId: number; threadIds: string[]; note?: string; createdBy: OutboxCreator };

export function enqueueForward(ctx: EnqueueContext, req: ForwardRequest): EnqueueResult {
  if (ctx.readOnly) return { ok: false, error: READ_ONLY_ERROR };
  const source = ctx.db
    .prepare("SELECT id, msg_type, text, recalled_at, raw_json FROM messages WHERE id = ?")
    .get(req.messageId) as SourceRow | undefined;
  if (!source) return { ok: false, error: `Không thấy tin #${req.messageId} trong kho.` };
  if (source.recalled_at) return { ok: false, error: "Tin đã bị thu hồi - không chuyển tiếp được." };
  const text = forwardableText(source);
  if (!text) return { ok: false, error: NOT_FORWARDABLE };

  const threadIds = [...new Set(req.threadIds)];
  if (threadIds.length === 0) return { ok: false, error: "Chưa chọn hội thoại nào." };
  if (threadIds.length > MAX_FORWARD_TARGETS) return { ok: false, error: `Mỗi lần chuyển tiếp tối đa ${MAX_FORWARD_TARGETS} hội thoại.` };
  const note = req.note?.trim() ?? "";
  if (note.length > MAX_TEXT_LENGTH) return { ok: false, error: `Lời nhắn dài ${note.length} ký tự, tối đa ${MAX_TEXT_LENGTH}.` };
  if (containsUnsafeControlChars(note)) return { ok: false, error: "Lời nhắn chứa ký tự điều khiển - không được phép." };

  const targets: ThreadSummary[] = [];
  for (const id of threadIds) {
    const thread = findThread(ctx.db, id);
    if (!thread) return { ok: false, error: `Không thấy hội thoại thread_id=${id} trong kho. Không tạo tin nào.` };
    targets.push(thread);
  }

  const batchId = randomUUID();
  const common = { mode: "single" as const, notBefore: null, batchId, createdBy: req.createdBy, note: null, status: "approved" as const };
  // Mỗi nơi: tin chuyển tiếp rồi tới lời nhắn (id tăng dần nên vòng gửi đi đúng thứ tự này)
  const ids = inTransaction(ctx.db, () =>
    targets.flatMap((t) => {
      const target = { threadId: t.threadId, threadType: t.threadType };
      const forwarded = enqueueOutboxItem(ctx.db, { ...target, ...common, text, forwardOf: source.id });
      return note ? [forwarded, enqueueOutboxItem(ctx.db, { ...target, ...common, text: note })] : [forwarded];
    }),
  );
  return { ok: true, ids, batchId, notBefore: null, warnings: [] };
}
