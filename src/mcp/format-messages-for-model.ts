import { DateTime } from "luxon";
import type { AttachmentRow, MessageRow, ThreadSummary } from "../storage/message-read-queries.js";

/** Định dạng dữ liệu kho thành chữ gọn cho model đọc. Module thuần. */

export function formatLocalTime(iso: string | null, timeZone: string): string {
  if (!iso) return "?";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timeZone);
  return dt.isValid ? dt.toFormat("dd/LL/yyyy HH:mm") : iso;
}

const ATTACHMENT_STATUS_TEXT: Record<string, string> = {
  pending: "chờ tải",
  downloading: "đang tải",
  done: "đã tải",
  failed: "tải hỏng",
  too_large: "quá cỡ, không tải",
  blocked_host: "host lạ, không tải",
};

function formatAttachment(a: AttachmentRow): string {
  const name = a.fileName ? ` "${a.fileName}"` : "";
  const status = ATTACHMENT_STATUS_TEXT[a.status] ?? a.status;
  return `  - đính kèm #${a.id} ${a.kind}${name}: ${status}`;
}

function formatReactions(m: MessageRow): string[] {
  if (m.reactions.length === 0) return [];
  return [`  - cảm xúc: ${m.reactions.map((r) => `${r.emoji ?? r.icon} x${r.count} (${r.names.join(", ")})`).join("; ")}`];
}

export function formatMessage(m: MessageRow, timeZone: string): string {
  // Sự kiện nhóm ("X đã thêm Y vào nhóm") đã là câu đầy đủ, không gắn người gửi
  if (m.msgType === "group_event") return `[#${m.id} ${formatLocalTime(m.sentAt, timeZone)}] (thông báo nhóm) ${m.text}`;
  const who = m.isSelf ? "Tôi" : `${m.senderName ?? "?"} (${m.senderId})`;
  const flags = [
    m.recalledAt ? "ĐÃ THU HỒI" : null,
    m.quoteMsgId ? `trả lời tin ${m.quoteMsgId}` : null,
    m.source !== "live" ? `nguồn: ${m.source}` : null,
  ].filter(Boolean);
  const head = `[#${m.id} ${formatLocalTime(m.sentAt, timeZone)}] ${who}${flags.length ? ` (${flags.join(", ")})` : ""}:`;
  const body = m.text ? ` ${m.text}` : "";
  return [head + body, ...m.attachments.map(formatAttachment), ...formatReactions(m)].join("\n");
}

export function formatMessages(messages: MessageRow[], timeZone: string): string {
  return messages.map((m) => formatMessage(m, timeZone)).join("\n");
}

export function formatThread(t: ThreadSummary, timeZone: string): string {
  const kind = t.threadType === "group" ? "nhóm" : t.isFriend ? "bạn bè" : "1-1";
  return `- ${t.name ?? "(chưa rõ tên)"} | thread_id=${t.threadId} | ${kind} | ${t.messageCount} tin | mới nhất ${formatLocalTime(t.lastMessageAt, timeZone)}`;
}
