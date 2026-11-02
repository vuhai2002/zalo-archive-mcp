import type { DatabaseSync } from "node:sqlite";

/**
 * Tin được trả lời, hiện trong ô trích dẫn như Zalo: tên người gửi + nội dung. `id` = số tin gốc trong kho
 * (bấm ô trích dẫn để nhảy tới); null khi tin gốc không có trong kho - khi đó tên + nội dung lấy từ chính
 * dữ liệu trích dẫn Zalo gửi kèm tin trả lời (`quote`: `fromD`, `msg`).
 */
export type QuotePreview = { id: number | null; senderName: string | null; isSelf: boolean; text: string };

/** Nội dung gọn cho tin gốc không có chữ (ảnh, sticker...), như Zalo */
const KIND_LABEL: Record<string, string> = {
  "chat.photo": "[Hình ảnh]",
  "chat.sticker": "[Sticker]",
  "chat.gif": "[GIF]",
  "chat.video.msg": "[Video]",
  "chat.voice": "[Tin nhắn thoại]",
  "share.file": "[File]",
  "chat.recommended": "[Liên kết]",
};

/** Từ dữ liệu trích dẫn Zalo gửi kèm (JSON `quote` của tin trả lời) */
export function quotePreviewFromRaw(quoteJson: unknown, selfUid: string | null): QuotePreview | null {
  if (typeof quoteJson !== "string") return null;
  try {
    const q = JSON.parse(quoteJson) as Record<string, unknown> | null;
    if (!q || typeof q !== "object") return null;
    const msg = typeof q.msg === "string" ? q.msg.trim() : "";
    return {
      id: null,
      senderName: typeof q.fromD === "string" && q.fromD.trim() ? q.fromD.trim() : null,
      isSelf: selfUid !== null && String(q.ownerId ?? "") === selfUid,
      text: msg || "[Tin nhắn]",
    };
  } catch {
    return null;
  }
}

/**
 * Tin gốc có trong kho: lấy số tin (để nhảy tới), tên theo danh bạ (tên gợi nhớ trước) và nội dung trong kho.
 * Không có thì giữ bản dựng từ dữ liệu trích dẫn.
 */
export function resolveQuotePreviews(
  db: DatabaseSync,
  messages: Array<{ threadId: string; quoteMsgId: string | null; quote: QuotePreview | null }>,
): void {
  const stmt = db.prepare(
    `SELECT m.id, m.is_self, m.msg_type, m.text, COALESCE(c.alias, m.sender_name, c.display_name) AS sender_name
     FROM messages m LEFT JOIN contacts c ON c.user_id = m.sender_id
     WHERE m.msg_id = ? AND m.thread_id = ?`,
  );
  for (const m of messages) {
    if (!m.quoteMsgId) continue;
    const o = stmt.get(m.quoteMsgId, m.threadId) as Record<string, unknown> | undefined;
    if (!o) continue;
    const own = String(o.text ?? "").trim();
    m.quote = {
      id: Number(o.id),
      senderName: (o.sender_name as string | null) ?? m.quote?.senderName ?? null,
      isSelf: o.is_self === 1,
      text: own || KIND_LABEL[String(o.msg_type)] || m.quote?.text || "[Tin nhắn]",
    };
  }
}
