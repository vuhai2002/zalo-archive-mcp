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

export type PreviewIcon = "file" | "image" | "video" | "link";
export type PreviewParts = { prefix: string; icon: PreviewIcon | null; text: string };

/** Như Zalo PC: ảnh / video hiện biểu tượng + chữ ("🖼 Hình ảnh"); sticker, GIF, tin thoại giữ ngoặc vuông */
const KIND_PREVIEW: Record<string, { icon: PreviewIcon | null; text: string }> = {
  photo: { icon: "image", text: "Hình ảnh" },
  video: { icon: "video", text: "Video" },
  gif: { icon: null, text: "[GIF]" },
  sticker: { icon: null, text: "[Sticker]" },
  voice: { icon: null, text: "[Tin nhắn thoại]" },
};

/**
 * Dòng xem trước tin cuối kiểu Zalo PC: "Bạn: " cho tin mình gửi, "Tên đầy đủ: " (tên gợi nhớ nếu có)
 * cho tin người khác trong nhóm; file hiện tên file (kèm biểu tượng ghim), ảnh / video hiện biểu tượng
 * + chữ, thẻ link hiện biểu tượng link + tiêu đề, sticker hiện nhãn trong ngoặc vuông.
 */
export function previewParts(last: LastMessagePreview | null, threadType: ThreadKind): PreviewParts {
  if (!last) return { prefix: "", icon: null, text: "" };
  // Tin hệ thống ("X đã thêm Y vào nhóm") đã là câu đầy đủ: không thêm "Bạn: " / tên người gửi
  if (last.msgType === "group_event" || last.msgType === "group.poll" || last.msgType === "chat.ecard") return { prefix: "", icon: null, text: last.text.trim() };
  const sender = last.senderName?.trim() ?? "";
  const prefix = last.isSelf ? "Bạn: " : threadType === "group" && sender ? `${sender}: ` : "";
  if (last.recalled) return { prefix, icon: null, text: "Tin nhắn đã được thu hồi" };
  if (last.attachmentKind === "file") return { prefix, icon: "file", text: last.attachmentName ?? "File" };
  const firstLine = last.text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const kind = last.attachmentKind ? KIND_PREVIEW[last.attachmentKind] : undefined;
  if (kind) {
    // Ảnh có chú thích thì hiện chú thích, như Zalo
    return { prefix, icon: kind.icon, text: firstLine && firstLine !== "[sticker]" ? firstLine : kind.text };
  }
  if (last.msgType === "chat.sticker") return { prefix, icon: null, text: "[Sticker]" };
  // Thẻ link (chat.recommended có địa chỉ web; tin cuộc gọi cùng loại nhưng không có link)
  if (last.msgType === "chat.recommended" && /https?:\/\//.test(last.text)) return { prefix, icon: "link", text: firstLine };
  return { prefix, icon: null, text: firstLine || `[${last.msgType}]` };
}
