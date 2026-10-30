import type { ArchivedMessage, AttachmentInfo, SharedAttachment } from "../../archive-api-types";
import { dayKey, formatClock } from "../../shared/format-archive-time";
import { sameOriginUrl } from "../../shared/same-origin-media-url";

/**
 * Một ảnh / video trong cửa sổ xem như Zalo PC, kèm đủ thông tin cho thanh dưới (người gửi, giờ, cảm
 * xúc) và "Xem tin nhắn gốc". Dựng được từ tin trong khung chat hoặc từ danh sách ảnh của hội thoại.
 * Module thuần.
 */
export type ViewerItem = {
  /** id đính kèm */
  id: number;
  kind: "photo" | "video" | "gif";
  url: string;
  mime: string | null;
  sentAt: string;
  messageId: number;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  isSelf: boolean;
  reactions: ArchivedMessage["reactions"];
};

const VIEWABLE = new Set(["photo", "video", "gif"]);

/** Ảnh SVG không mở trong cửa sổ xem (file người lạ gửi, có thể chứa script) */
const isSvg = (mime: string | null) => !!mime?.toLowerCase().includes("svg");

function itemFrom(a: AttachmentInfo, m: Omit<ViewerItem, "id" | "kind" | "url" | "mime">): ViewerItem | null {
  const url = a.status === "done" ? sameOriginUrl(a.url) : null;
  if (!url || !VIEWABLE.has(a.kind) || isSvg(a.mime)) return null;
  return { id: a.id, kind: a.kind as ViewerItem["kind"], url, mime: a.mime, ...m };
}

export function viewerItemFromMessage(m: ArchivedMessage, a: AttachmentInfo): ViewerItem | null {
  return itemFrom(a, {
    sentAt: m.sentAt,
    messageId: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatarUrl: m.senderAvatarUrl,
    isSelf: m.isSelf,
    reactions: m.reactions,
  });
}

export function viewerItemFromShared(a: SharedAttachment): ViewerItem | null {
  return itemFrom(a, {
    sentAt: a.sentAt,
    messageId: a.messageId,
    senderId: a.senderId,
    senderName: a.senderName,
    senderAvatarUrl: a.senderAvatarUrl,
    isSelf: a.isSelf,
    reactions: a.reactions,
  });
}

/** "00:33", "12:05", "1:02:03" - thời lượng video như Zalo */
export function formatVideoDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Nhãn ngày trên dải ảnh: "Hôm nay", "04/10" (cùng năm), "04/10/2025" */
export function stripDayLabel(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = dayKey(iso, timeZone);
  const today = dayKey(now.toISOString(), timeZone);
  if (day === today) return "Hôm nay";
  const [y, mo, d] = day.split("-");
  return y === today.slice(0, 4) ? `${d}/${mo}` : `${d}/${mo}/${y}`;
}

/** Giờ gửi ở thanh dưới: "13:11 Hôm nay", "08:02 Hôm qua", "12:15 23/10/2026" */
export function viewerTimeLabel(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = dayKey(iso, timeZone);
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  const [y, mo, d] = day.split("-");
  const label = day === today ? "Hôm nay" : day === yesterday ? "Hôm qua" : `${d}/${mo}/${y}`;
  return `${formatClock(iso, timeZone)} ${label}`;
}

/** Chèn một mục vào danh sách đã xếp theo giờ gửi (cũ trước), không trùng id */
export function insertByTime(items: ViewerItem[], item: ViewerItem): ViewerItem[] {
  if (items.some((x) => x.id === item.id)) return items;
  const at = items.findIndex((x) => x.sentAt > item.sentAt || (x.sentAt === item.sentAt && x.id > item.id));
  return at === -1 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}
