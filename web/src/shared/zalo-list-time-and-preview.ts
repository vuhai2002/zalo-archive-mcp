import type { LastMessagePreview, ThreadKind } from "../archive-api-types";

/**
 * Thời gian ở danh sách hội thoại theo kiểu Zalo: "Vài giây", "20 phút", "3 giờ",
 * "7 ngày", rồi ngày "21/10" (khác năm thì "21/10/25"). Module thuần.
 */
export function zaloListTime(iso: string | null | undefined, timeZone: string, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const diff = Math.max(0, now.getTime() - t.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Vài giây";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} ngày`;
  const day = (d: Date) => {
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(d);
    } catch {
      parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(d);
    }
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return { dm: `${get("day")}/${get("month")}`, yy: get("year") };
  };
  const a = day(t);
  return a.yy === day(now).yy ? a.dm : `${a.dm}/${a.yy}`;
}

export type PreviewParts = { prefix: string; icon: "file" | null; text: string };

const KIND_TEXT: Record<string, string> = {
  photo: "[Hình ảnh]",
  gif: "[GIF]",
  sticker: "[Sticker]",
  video: "[Video]",
  voice: "[Tin nhắn thoại]",
};

/**
 * Dòng xem trước tin cuối kiểu Zalo: "Bạn: " cho tin mình gửi, "Tên: " cho tin
 * người khác trong nhóm; file hiện tên file (kèm biểu tượng ghim), ảnh/sticker
 * hiện nhãn trong ngoặc vuông.
 */
export function previewParts(last: LastMessagePreview | null, threadType: ThreadKind): PreviewParts {
  if (!last) return { prefix: "", icon: null, text: "" };
  // Tin hệ thống ("X đã thêm Y vào nhóm") đã là câu đầy đủ: không thêm "Bạn: " / tên người gửi
  if (last.msgType === "group_event" || last.msgType === "chat.ecard") return { prefix: "", icon: null, text: last.text.trim() };
  const firstName = last.senderName?.trim().split(/\s+/).at(-1) ?? "";
  const prefix = last.isSelf ? "Bạn: " : threadType === "group" && firstName ? `${firstName}: ` : "";
  if (last.recalled) return { prefix, icon: null, text: "Tin nhắn đã được thu hồi" };
  if (last.attachmentKind === "file") return { prefix, icon: "file", text: last.attachmentName ?? "File" };
  const firstLine = last.text.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (last.attachmentKind && last.attachmentKind in KIND_TEXT) {
    // Ảnh có chú thích thì hiện chú thích, như Zalo
    return { prefix, icon: null, text: firstLine && firstLine !== "[sticker]" ? firstLine : KIND_TEXT[last.attachmentKind]! };
  }
  if (last.msgType === "chat.sticker") return { prefix, icon: null, text: "[Sticker]" };
  return { prefix, icon: null, text: firstLine || `[${last.msgType}]` };
}
