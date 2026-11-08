import fs from "node:fs";
import path from "node:path";

/**
 * Media Zalo PC đã tải về máy (thư mục `ZaloDownloads` của nick), dò bằng TÊN FILE - bước này không mở
 * file nào và không bao giờ ghi vào thư mục của Zalo PC (CLAUDE.md: chỉ đọc). Cách Zalo PC đặt tên
 * (kiểm trên Zalo PC 26.10.20 - 26.11.10):
 * - theo tin: `resource/<hội thoại>/<thư mục con>/<cliMsgId>_<người gửi>_<hội thoại>[_<hậu tố>]`, hội thoại =
 *   `g<mã nhóm>` hoặc mã người kia (1-1), người gửi = mã người gửi (tin mình gửi là mã mình). Thư mục con:
 *   `picture` = ảnh gốc HD (thường JPEG XL), `Cache/<...>_n` = bản JPEG xem trước, `video` = MP4 (cả video gửi
 *   dạng file), `file` = file đính kèm, `fileNoise` = file đính kèm bị làm nhiễu, `voice` = tin thoại (AAC);
 * - kiểu cũ (Zalo PC trước khoảng 07/2026): `video/<mã tin>`, `voice/<mã tin>` (thêm `group/` với nhóm), tên là mã
 *   tin Zalo (msgId). Đa số trùng bản trong `resource`, chỉ dùng khi `resource` không có;
 * - file đính kèm theo checksum: `file/<md5>`, `fileNoise/<md5>` (thêm `group/`), tên là MD5 Zalo ghi trong tin;
 * - `Zalo Received Files` (Zalo PC bản cũ, nằm ngoài ZaloDownloads): file gốc giữ tên thật - dò theo tên + cỡ.
 */
export type ZaloPcMessageMedia = { picture?: string; preview?: string; video?: string; file?: string; fileNoise?: string; voice?: string };
export type ZaloPcMediaIndex = {
  byMessage: Map<string, ZaloPcMessageMedia>;
  /** file/<md5>: bản thường theo checksum */
  plainFiles: Map<string, string>;
  /** fileNoise/<md5>: bản bị làm nhiễu theo checksum */
  noiseFiles: Map<string, string>;
  /** Video / tin thoại kiểu cũ theo mã tin Zalo */
  videosByMsgId: Map<string, string>;
  voicesByMsgId: Map<string, string>;
  /** `Zalo Received Files`: khóa `receivedFileKey(tên, cỡ)` */
  receivedFiles: Map<string, string>;
};

const MESSAGE_FILE = /^(\d+)_(\d+)_(g?\d+)(?:_(.+))?$/;
const MD5_NAME = /^[a-f0-9]{32}$/i;
const MSG_ID_NAME = /^\d+$/;
const RESOURCE_SUBS = ["picture", "Cache", "video", "file", "fileNoise", "voice"] as const;

export const zaloPcMessageKey = (cliMsgId: string, senderUid: string, conversation: string) => `${cliMsgId}_${senderUid}_${conversation}`;
export const receivedFileKey = (fileName: string, size: number) => `${fileName.toLowerCase()}|${size}`;

function listEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Vai trò của một file trong `resource/<hội thoại>/<sub>` theo hậu tố tên; null = không dùng */
function roleOf(sub: (typeof RESOURCE_SUBS)[number], suffix: string | undefined): keyof ZaloPcMessageMedia | null {
  if (sub === "picture") return suffix ? "picture" : null;
  if (sub === "Cache") return suffix === "n" ? "preview" : null;
  return suffix ? null : sub;
}

/** Tên -> đường dẫn của các file khớp `pattern` trong `<dir>` và `<dir>/group` */
function byName(dir: string, pattern: RegExp, lower = false): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [dir, path.join(dir, "group")]) {
    for (const f of listEntries(d)) if (f.isFile() && pattern.test(f.name)) out.set(lower ? f.name.toLowerCase() : f.name, path.join(d, f.name));
  }
  return out;
}

/** Mọi file trong các thư mục `Zalo Received Files` (kể cả thư mục con), theo tên + cỡ */
function indexReceivedFiles(dirs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of listEntries(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        try {
          const key = receivedFileKey(e.name, fs.statSync(p).size);
          if (!out.has(key)) out.set(key, p);
        } catch {
          // file vừa bị xóa / không đọc được: bỏ qua
        }
      }
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

export function buildZaloPcMediaIndex(downloadsDir: string, receivedDirs: string[] = []): ZaloPcMediaIndex {
  const byMessage = new Map<string, ZaloPcMessageMedia>();
  const resourceDir = path.join(downloadsDir, "resource");
  for (const conv of listEntries(resourceDir)) {
    if (!conv.isDirectory()) continue;
    for (const sub of RESOURCE_SUBS) {
      const subDir = path.join(resourceDir, conv.name, sub);
      for (const f of listEntries(subDir)) {
        if (!f.isFile()) continue;
        const m = MESSAGE_FILE.exec(f.name);
        const role = m ? roleOf(sub, m[4]) : null;
        if (!m || !role) continue;
        const key = zaloPcMessageKey(m[1]!, m[2]!, m[3]!);
        const entry = byMessage.get(key) ?? {};
        entry[role] ??= path.join(subDir, f.name);
        byMessage.set(key, entry);
      }
    }
  }
  return {
    byMessage,
    plainFiles: byName(path.join(downloadsDir, "file"), MD5_NAME, true),
    noiseFiles: byName(path.join(downloadsDir, "fileNoise"), MD5_NAME, true),
    videosByMsgId: byName(path.join(downloadsDir, "video"), MSG_ID_NAME),
    voicesByMsgId: byName(path.join(downloadsDir, "voice"), MSG_ID_NAME),
    receivedFiles: indexReceivedFiles(receivedDirs),
  };
}
