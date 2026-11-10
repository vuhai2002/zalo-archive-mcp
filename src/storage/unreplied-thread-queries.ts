import type { DatabaseSync } from "node:sqlite";
import { callNoticeOf, type CallNotice } from "../archive/zalo-call-message-text.js";
import { withZaloEmoticons } from "../archive/zalo-emoticon-emoji.js";
import { parseMentions } from "../archive/zalo-mention-names.js";
import { reactionSummaries } from "./message-reaction-store.js";
import { myDocumentsThreadId } from "./my-documents-deletion-store.js";
import { findThread, type ThreadSummary } from "./thread-list-queries.js";
import { getMeta } from "./thread-directory-store.js";

/**
 * Hội thoại đang chờ mình trả lời (câu "có tin nào tôi chưa rep không"). Kho KHÔNG biết mình đã đọc tin trên điện thoại hay
 * chưa (không lưu trạng thái đã xem), nên "chưa trả lời" = sau tin của người kia mình chưa phản hồi:
 * - 1-1: tin cuối là của người kia, bỏ qua thứ không phải lời người nhắn (thẻ tin Zalo, quảng cáo OA, thiệp sinh nhật /
 *   vừa kết bạn) và tin đã thu hồi. Mình nhắn lại, nghe máy (cuộc gọi có thời lượng, gọi đi hay đến) hoặc thả cảm xúc vào
 *   tin cuối của họ đều tính là đã phản hồi; cuộc gọi nhỡ thì chưa.
 * - Nhóm: chỉ tin NHẮC TÊN mình (không tính @All) hoặc TRẢ LỜI tin của mình, gửi sau lần cuối mình nhắn trong nhóm và mình
 *   chưa thả cảm xúc. Nhóm ai cũng nhắn nên "tin cuối không phải của mình" gần như luôn đúng, không dùng được.
 */

export type PendingMessage = { id: number; msgId: string; senderName: string | null; sentAt: string; preview: string; missedCall: boolean };

export type UnrepliedThread = {
  thread: ThreadSummary;
  /** direct: hội thoại 1-1; mention: nhóm có tin nhắc tên / trả lời mình */
  reason: "direct" | "mention";
  /** Tin chưa trả lời, MỚI nhất trước (1-1: tối đa trong SCAN_LIMIT tin gần nhất) */
  pending: PendingMessage[];
};

// Không phải lời người nhắn: thông báo nhóm, bình chọn, thiệp, thẻ tin / tin quảng cáo của Zalo và OA
const NOT_CONVERSATION = ["group_event", "group.poll", "chat.ecard", "chat.list.action", "chat.webcontent", "chat.webcontent.v2"];
const NOT_CONVERSATION_SQL = NOT_CONVERSATION.map((t) => `'${t}'`).join(", ");
/** 1-1: chỉ xét chừng này tin gần nhất - đủ số này thì số tin chờ có thể còn nhiều hơn */
export const UNREPLIED_SCAN_LIMIT = 50;
const SCAN_LIMIT = UNREPLIED_SCAN_LIMIT;
const MEDIA_LABEL: Record<string, string> = {
  "chat.photo": "[ảnh]",
  "chat.sticker": "[sticker]",
  "chat.gif": "[GIF]",
  "chat.video.msg": "[video]",
  "chat.voice": "[tin thoại]",
  "share.file": "[file]",
  "chat.location.new": "[vị trí]",
  "chat.doodle": "[hình vẽ]",
};

const COLS = `m.id, m.msg_id, m.thread_id, m.is_self, m.msg_type, m.text, m.sent_at,
  COALESCE((SELECT alias FROM contacts c WHERE c.user_id = m.sender_id), m.sender_name,
    (SELECT display_name FROM contacts c WHERE c.user_id = m.sender_id)) AS sender_name,
  CASE WHEN m.msg_type = 'chat.recommended' AND json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.content') END AS rec_content`;

type Row = Record<string, unknown>;

function callOf(r: Row): CallNotice | null {
  if (typeof r.rec_content !== "string") return null;
  try {
    const c = JSON.parse(r.rec_content) as { action?: unknown; params?: unknown } | null;
    return c ? callNoticeOf(c.action, c.params) : null;
  } catch {
    return null;
  }
}

function toPending(r: Row, call: CallNotice | null): PendingMessage {
  const text = withZaloEmoticons(String(r.text ?? "")).text.replace(/\s+/g, " ").trim();
  return {
    id: Number(r.id),
    msgId: String(r.msg_id),
    senderName: (r.sender_name as string | null) ?? null,
    sentAt: String(r.sent_at),
    // Cắt theo ký tự thật (Array.from), không cắt đôi emoji
    preview: call ? `${call.title} (${call.detail})` : Array.from(text || MEDIA_LABEL[String(r.msg_type)] || `[${String(r.msg_type)}]`).slice(0, 120).join(""),
    missedCall: call?.missedIncoming ?? false,
  };
}

/** 1-1: các tin người kia gửi kể từ lần cuối mình phản hồi */
function directPending(db: DatabaseSync, sinceIso: string): Array<{ threadId: string; pending: PendingMessage[] }> {
  const skip = myDocumentsThreadId(db);
  const threads = db
    .prepare("SELECT thread_id FROM threads WHERE thread_type = 'user' AND last_message_at >= ? ORDER BY last_message_at DESC")
    .all(sinceIso) as Array<{ thread_id: string }>;
  const recent = db.prepare(
    `SELECT ${COLS} FROM messages m WHERE m.thread_id = ? AND m.thread_type = 'user' AND m.recalled_at IS NULL
       AND m.msg_type NOT IN (${NOT_CONVERSATION_SQL}) ORDER BY m.sent_at DESC, m.id DESC LIMIT ${SCAN_LIMIT}`,
  );
  const out: Array<{ threadId: string; pending: PendingMessage[] }> = [];
  for (const { thread_id: threadId } of threads) {
    if (threadId === skip) continue;
    const pending: PendingMessage[] = [];
    for (const r of recent.all(threadId) as Row[]) {
      const call = callOf(r);
      if (r.is_self === 1 || (call && !call.missedIncoming)) break;
      pending.push(toPending(r, call));
    }
    // Tin cũ của họ còn treo nhưng gần đây chỉ có thiệp / thẻ Zalo: ngoài khoảng đang hỏi
    if (pending.length > 0 && pending[0]!.sentAt >= sinceIso) out.push({ threadId, pending });
  }
  return out;
}

/** Nhóm: tin nhắc tên mình (không tính @All) hoặc trả lời tin của mình, sau lần cuối mình nhắn trong nhóm */
function mentionPending(db: DatabaseSync, sinceIso: string, selfUid: string): Array<{ threadId: string; pending: PendingMessage[] }> {
  // Lọc thô bằng mã của mình trong dữ liệu gốc (dùng chỉ mục theo giờ), rồi đọc JSON để chắc là nhắc / trả lời mình
  const rows = db
    .prepare(
      `SELECT ${COLS},
         CASE WHEN json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.mentions') END AS mentions_raw,
         CASE WHEN json_valid(m.raw_json) THEN json_extract(m.raw_json, '$.quote.ownerId') END AS quote_owner
       FROM messages m WHERE m.thread_type = 'group' AND m.sent_at >= ? AND m.is_self = 0 AND m.recalled_at IS NULL
         AND instr(m.raw_json, ?) > 0 ORDER BY m.sent_at DESC, m.id DESC`,
    )
    .all(sinceIso, selfUid) as Row[];
  const byThread = new Map<string, Row[]>();
  for (const r of rows) {
    const mentioned = parseMentions(r.mentions_raw).some((m) => m.uid === selfUid && m.type === 0);
    if (!mentioned && String(r.quote_owner ?? "") !== selfUid) continue;
    const list = byThread.get(String(r.thread_id)) ?? [];
    list.push(r);
    byThread.set(String(r.thread_id), list);
  }
  const mine = db.prepare(
    "SELECT MAX(sent_at) AS t FROM messages WHERE thread_id = ? AND thread_type = 'group' AND is_self = 1 AND sent_at >= ?",
  );
  const out: Array<{ threadId: string; pending: PendingMessage[] }> = [];
  for (const [threadId, list] of byThread) {
    const myLast = (mine.get(threadId, String(list.at(-1)!.sent_at)) as { t: string | null }).t;
    const pending = list.filter((r) => myLast === null || String(r.sent_at) > myLast).map((r) => toPending(r, null));
    if (pending.length > 0) out.push({ threadId, pending });
  }
  return out;
}

/** Hội thoại chờ mình trả lời có tin từ `sinceIso`, tin chờ mới nhất trước */
export function listUnrepliedThreads(db: DatabaseSync, opts: { sinceIso: string }): UnrepliedThread[] {
  const selfUid = getMeta(db, "self_uid");
  const direct = directPending(db, opts.sinceIso).map((x) => ({ ...x, reason: "direct" as const }));
  const groups = selfUid ? mentionPending(db, opts.sinceIso, selfUid).map((x) => ({ ...x, reason: "mention" as const })) : [];

  // Đã thả cảm xúc = đã phản hồi: 1-1 xét tin cuối của họ, nhóm xét từng tin nhắc mình
  const ids = [...direct.map((x) => x.pending[0]!.msgId), ...groups.flatMap((x) => x.pending.map((p) => p.msgId))];
  const reactions = reactionSummaries(db, ids, selfUid);
  const reacted = (p: PendingMessage) => (reactions.get(p.msgId) ?? []).some((s) => s.mine);

  const out: UnrepliedThread[] = [];
  for (const x of direct) {
    if (reacted(x.pending[0]!)) continue;
    const thread = findThread(db, x.threadId);
    if (thread) out.push({ thread, reason: x.reason, pending: x.pending });
  }
  for (const x of groups) {
    const pending = x.pending.filter((p) => !reacted(p));
    const thread = pending.length > 0 ? findThread(db, x.threadId) : null;
    if (thread) out.push({ thread, reason: x.reason, pending });
  }
  return out.sort((a, b) => (a.pending[0]!.sentAt < b.pending[0]!.sentAt ? 1 : -1));
}
