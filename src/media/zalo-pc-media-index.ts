import fs from "node:fs";
import path from "node:path";

/**
 * Media Zalo PC đã tải về máy (thư mục `ZaloDownloads` của nick), dò bằng TÊN FILE - bước này không mở
 * file nào và không bao giờ ghi vào thư mục của Zalo PC (CLAUDE.md: chỉ đọc). Cách Zalo PC đặt tên
 * (kiểm trên Zalo PC 26.10.20):
 * - ảnh / video: `resource/<hội thoại>/<picture | Cache | video>/<cliMsgId>_<người gửi>_<hội thoại>[_<hậu tố>]`,
 *   hội thoại = `g<mã nhóm>` hoặc mã người kia (1-1), người gửi = mã người gửi (tin mình gửi là mã mình).
 *   `picture` = bản gốc HD (thường JPEG XL), `Cache/<...>_n` = bản JPEG xem trước (nhỏ hơn), `video` = MP4;
 * - video kiểu cũ (Zalo PC trước khoảng 07/2026): `video/<mã tin>` (1-1) hoặc `video/group/<mã tin>`, tên là mã
 *   tin Zalo (msgId). Đa số trùng bản trong `resource`, chỉ dùng khi `resource` không có;
 * - file đính kèm: `file/<md5>` hoặc `file/group/<md5>`, tên là checksum MD5 Zalo ghi trong tin. File trong
 *   `fileNoise` bị Zalo PC biến đổi nội dung (dài hơn bản gốc 6 byte, MD5 khác) - không dùng.
 */
export type ZaloPcMessageMedia = { picture?: string; preview?: string; video?: string };
export type ZaloPcMediaIndex = {
  byMessage: Map<string, ZaloPcMessageMedia>;
  plainFiles: Map<string, string>;
  /** Video kiểu cũ theo mã tin Zalo */
  videosByMsgId: Map<string, string>;
};

const MESSAGE_FILE = /^(\d+)_(\d+)_(g?\d+)(?:_(.+))?$/;
const MD5_NAME = /^[a-f0-9]{32}$/i;
const MSG_ID_NAME = /^\d+$/;

export const zaloPcMessageKey = (cliMsgId: string, senderUid: string, conversation: string) => `${cliMsgId}_${senderUid}_${conversation}`;

function listEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function buildZaloPcMediaIndex(downloadsDir: string): ZaloPcMediaIndex {
  const byMessage = new Map<string, ZaloPcMessageMedia>();
  const note = (key: string, role: keyof ZaloPcMessageMedia, file: string) => {
    const entry = byMessage.get(key) ?? {};
    entry[role] ??= file;
    byMessage.set(key, entry);
  };
  const resourceDir = path.join(downloadsDir, "resource");
  for (const conv of listEntries(resourceDir)) {
    if (!conv.isDirectory()) continue;
    for (const sub of ["picture", "Cache", "video"] as const) {
      const subDir = path.join(resourceDir, conv.name, sub);
      for (const f of listEntries(subDir)) {
        if (!f.isFile()) continue;
        const m = MESSAGE_FILE.exec(f.name);
        if (!m) continue;
        const key = zaloPcMessageKey(m[1]!, m[2]!, m[3]!);
        const file = path.join(subDir, f.name);
        if (sub === "picture" && m[4]) note(key, "picture", file);
        else if (sub === "Cache" && m[4] === "n") note(key, "preview", file);
        else if (sub === "video" && !m[4]) note(key, "video", file);
      }
    }
  }
  const plainFiles = new Map<string, string>();
  for (const dir of [path.join(downloadsDir, "file"), path.join(downloadsDir, "file", "group")]) {
    for (const f of listEntries(dir)) if (f.isFile() && MD5_NAME.test(f.name)) plainFiles.set(f.name.toLowerCase(), path.join(dir, f.name));
  }
  const videosByMsgId = new Map<string, string>();
  for (const dir of [path.join(downloadsDir, "video"), path.join(downloadsDir, "video", "group")]) {
    for (const f of listEntries(dir)) if (f.isFile() && MSG_ID_NAME.test(f.name)) videosByMsgId.set(f.name, path.join(dir, f.name));
  }
  return { byMessage, plainFiles, videosByMsgId };
}

export type ZaloPcMediaOwner = {
  kind: string;
  /** Mã tin Zalo (msgId) - tên video kiểu cũ */
  msgId: string;
  threadId: string;
  threadType: "user" | "group";
  senderId: string;
  isSelf: boolean;
  cliMsgId: string | null;
  /** Checksum MD5 Zalo ghi cho file đính kèm (content.params.checksum) */
  checksum: string | null;
};

/** Bản Zalo PC của một đính kèm: ảnh có bản gốc và / hoặc bản xem trước; video, file là một file */
export type ZaloPcMediaMatch =
  | { kind: "photo"; original: string | null; preview: string | null }
  | { kind: "video"; file: string }
  | { kind: "file"; file: string; md5: string };

export function findZaloPcMedia(index: ZaloPcMediaIndex, owner: ZaloPcMediaOwner, selfUid: string): ZaloPcMediaMatch | null {
  if (owner.kind === "file") {
    const md5 = owner.checksum?.toLowerCase() ?? "";
    const file = MD5_NAME.test(md5) ? index.plainFiles.get(md5) : undefined;
    return file ? { kind: "file", file, md5 } : null;
  }
  const conversation = owner.threadType === "group" ? `g${owner.threadId}` : owner.threadId;
  const media = owner.cliMsgId
    ? index.byMessage.get(zaloPcMessageKey(owner.cliMsgId, owner.isSelf ? selfUid : owner.senderId, conversation))
    : undefined;
  if (owner.kind === "photo" || owner.kind === "gif") {
    return media?.picture || media?.preview ? { kind: "photo", original: media.picture ?? null, preview: media.preview ?? null } : null;
  }
  if (owner.kind === "video") {
    const file = media?.video ?? index.videosByMsgId.get(owner.msgId);
    return file ? { kind: "video", file } : null;
  }
  return null;
}
