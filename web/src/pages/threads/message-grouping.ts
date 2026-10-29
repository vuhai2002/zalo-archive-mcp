import type { ArchivedMessage } from "../../archive-api-types";
import { dayKey, formatClock, formatDayHeading } from "../../shared/format-archive-time";

/**
 * Bố cục khung chat kiểu Zalo: tin liên tiếp của CÙNG một người, cách nhau không quá
 * vài phút, gộp thành một cụm - avatar (và tên trong nhóm) chỉ ở tin đầu cụm, giờ chỉ
 * ở tin cuối cụm. Vạch giờ "21:03 Hôm nay" / "09:15 Thứ Năm, 12/03/2026" đặt ở tin đầu,
 * khi sang ngày mới, và sau mỗi lần ngắt quãng lâu (như Zalo).
 */
export const GROUP_GAP_MS = 5 * 60_000;
/** Hai tin cách nhau từ chừng này trở lên thì chèn vạch giờ mới (ngưỡng tự chọn, Zalo không công bố) */
export const SEPARATOR_GAP_MS = 60 * 60_000;

/** Tin hệ thống ("X đã đồng ý kết bạn", "X đã thêm Y vào nhóm"): hiện giữa khung, không thuộc cụm nào */
export const isSystemMessage = (m: Pick<ArchivedMessage, "msgType">) => m.msgType === "chat.ecard" || m.msgType === "group_event";

export type MessageLayout = {
  /** Vạch giờ đặt TRƯỚC tin này ("21:03 Hôm nay"); null nếu cùng ngày và gần tin trước */
  separatorLabel: string | null;
  firstInGroup: boolean;
  lastInGroup: boolean;
};

const senderKey = (m: ArchivedMessage) => `${m.isSelf ? "me" : "them"}:${m.senderId}`;

function sameGroup(a: ArchivedMessage | undefined, b: ArchivedMessage | undefined, tz: string): boolean {
  if (!a || !b || isSystemMessage(a) || isSystemMessage(b)) return false;
  if (senderKey(a) !== senderKey(b) || dayKey(a.sentAt, tz) !== dayKey(b.sentAt, tz)) return false;
  return Math.abs(Date.parse(b.sentAt) - Date.parse(a.sentAt)) <= GROUP_GAP_MS;
}

/** "Hôm nay", "Hôm qua", hoặc "Thứ Năm, 12/03/2026" theo giờ của kho */
export function chatDayLabel(iso: string, tz: string, now: Date = new Date()): string {
  const key = dayKey(iso, tz);
  if (key === dayKey(now.toISOString(), tz)) return "Hôm nay";
  if (key === dayKey(new Date(now.getTime() - 86_400_000).toISOString(), tz)) return "Hôm qua";
  return formatDayHeading(iso, tz);
}

export function layoutMessages(messages: ArchivedMessage[], tz: string, now: Date = new Date()): MessageLayout[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const separator =
      !prev ||
      dayKey(prev.sentAt, tz) !== dayKey(m.sentAt, tz) ||
      Date.parse(m.sentAt) - Date.parse(prev.sentAt) >= SEPARATOR_GAP_MS;
    return {
      separatorLabel: separator ? `${formatClock(m.sentAt, tz)} ${chatDayLabel(m.sentAt, tz, now)}` : null,
      firstInGroup: !sameGroup(prev, m, tz),
      lastInGroup: !sameGroup(m, next, tz),
    };
  });
}
