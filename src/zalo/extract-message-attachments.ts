import type { AttachmentDescriptor, AttachmentKind } from "../archive/archived-message-types.js";

/**
 * Rút danh sách file đính kèm (ảnh, video, file, voice, gif) từ `content` của
 * một tin Zalo. Module thuần.
 *
 * Bảng loại tin lấy từ deplao-builder (MIT) + zalo-agent. Sticker và link KHÔNG
 * tải: sticker là ảnh dùng chung của Zalo, còn `href` của link do người gửi tự
 * đặt (tải về là mở đường cho người lạ bắt máy mình gọi URL tùy ý).
 */
const KIND_BY_MSG_TYPE: Record<string, AttachmentKind> = {
  "chat.photo": "photo",
  photo: "photo",
  image: "photo",
  "chat.doodle": "photo",
  "chat.gif": "gif",
  gif: "gif",
  "chat.video.msg": "video",
  "chat.video": "video",
  video: "video",
  "share.file": "file",
  file: "file",
  "chat.voice": "voice",
  voice: "voice",
};

/** Thứ tự ưu tiên URL ảnh: bản to nhất trước, vì đây là bản lưu trữ (theo deplao) */
const PHOTO_URL_KEYS = ["rawUrl", "normalUrl", "hdUrl", "hd", "href", "thumb", "url"];

export function attachmentKindOf(msgType: string): AttachmentKind | null {
  return KIND_BY_MSG_TYPE[msgType] ?? null;
}

/** `params` của content là CHUỖI JSON; hỏng thì coi như rỗng */
export function parseContentParams(content: Record<string, unknown>): Record<string, unknown> {
  const raw = content.params;
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function extractMessageAttachments(msgType: string, content: unknown): AttachmentDescriptor[] {
  const kind = attachmentKindOf(msgType);
  if (!kind || !content || typeof content !== "object" || Array.isArray(content)) return [];
  const c = content as Record<string, unknown>;
  const params = parseContentParams(c);

  let url: string | null = null;
  if (kind === "photo") {
    url = httpUrl(params.hd);
    for (const key of PHOTO_URL_KEYS) url ??= httpUrl(c[key]);
  } else {
    url = httpUrl(c.href) ?? httpUrl(c.url);
  }
  if (!url) return [];

  const fileName = kind === "file" && typeof c.title === "string" && c.title.trim() ? c.title.trim() : null;
  return [{ kind, remoteUrl: url, fileName, declaredSize: positiveInt(params.fileSize) }];
}
