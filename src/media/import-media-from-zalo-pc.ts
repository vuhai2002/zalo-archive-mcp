import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { failedAttachmentsForRecovery, markAttachmentRecovered, type RecoveryCandidate } from "../storage/attachment-local-recovery-store.js";
import { findZaloPcMedia, type ZaloPcMediaMatch } from "./find-zalo-pc-copy-for-attachment.js";
import { chooseExtension, mediaRelativePath } from "./media-file-naming.js";
import { placeDownloadedFile, saveJxlPhotoAsPng, type ConvertJxlToPng, type SavedMedia } from "./save-jxl-photo-as-png.js";
import { copyIntoTemp, sniff, type Copied } from "./zalo-pc-file-copy.js";
import { buildZaloPcMediaIndex } from "./zalo-pc-media-index.js";
import { convertJxlToPng } from "./zalo-jxl-photo.js";

/**
 * Lấy lại ảnh / video / file / tin thoại mà kho không tải được (Zalo đã xóa khỏi máy chủ) từ bản Zalo PC đã tải về
 * máy. Nguồn chỉ được MỞ ĐỂ ĐỌC rồi chép sang thư mục media của kho - không ghi, đổi tên, xóa gì của Zalo PC
 * (CLAUDE.md). Mỗi bản chép được kiểm trước khi nhận: ảnh phải đúng chữ ký ảnh, video phải là MP4, tin thoại phải
 * là AAC, file đính kèm phải đúng MD5 Zalo ghi trong tin (bản bị làm nhiễu được bỏ nhiễu rồi mới kiểm). Ảnh: bản
 * JPEG xem trước làm file hiện trên dashboard, bản gốc HD (JXL) giữ ngay cạnh; chỉ có bản JXL thì đổi sang PNG như
 * lúc tải. Chép / đổi vài file cùng lúc (`concurrency`) vì đổi một ảnh JXL mất vài giây; việc đổi chạy ở luồng phụ
 * (`convertJxl` = `JxlPngWorkerPool`) để daemon vẫn nghe tin và dashboard không đứng.
 */
export const ZALO_PC_SOURCE = "zalo_pc";

export type { ZaloPcImportProgress } from "../dashboard/dashboard-api-contract.js";
import type { ZaloPcImportProgress } from "../dashboard/dashboard-api-contract.js";

const IMAGE: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: ".jpg", mime: "image/jpeg" },
  png: { ext: ".png", mime: "image/png" },
  gif: { ext: ".gif", mime: "image/gif" },
  webp: { ext: ".webp", mime: "image/webp" },
};

function place(mediaDir: string, c: Copied, ext: string, mime: string | null): SavedMedia {
  const rel = mediaRelativePath(c.sha256, ext);
  placeDownloadedFile(c.tempFile, path.join(mediaDir, rel));
  return { rel, sha256: c.sha256, sizeBytes: c.sizeBytes, mime };
}

type StoreOptions = { mediaDir: string; tempDir: string; convertJxl: ConvertJxlToPng };

/** Chép + kiểm + cất một bản Zalo PC; null nếu không bản nào đúng loại / đúng MD5 (không nhận) */
async function storeMatch(o: StoreOptions, c: RecoveryCandidate, match: ZaloPcMediaMatch): Promise<SavedMedia | null> {
  if (match.kind === "photo") return storePhoto(o, match);
  if (match.kind === "file") return storeFile(o, c, match);
  const copied = await copyIntoTemp(match.file, o.tempDir);
  if (match.kind === "voice") return sniff(copied.head) === "aac" ? place(o.mediaDir, copied, ".aac", "audio/aac") : reject(copied);
  return sniff(copied.head) === "mp4" ? place(o.mediaDir, copied, ".mp4", "video/mp4") : reject(copied);
}

/** File đính kèm: thử lần lượt từng bản, nhận bản đầu tiên đúng MD5 (tin không có checksum: bản gắn chắc với tin) */
async function storeFile(o: StoreOptions, c: RecoveryCandidate, match: Extract<ZaloPcMediaMatch, { kind: "file" }>): Promise<SavedMedia | null> {
  for (const source of match.sources) {
    if (!match.md5 && !source.sure) continue;
    let copied: Copied;
    try {
      copied = await copyIntoTemp(source.file, o.tempDir, { denoise: source.noise });
    } catch {
      continue; // bản bị làm nhiễu mà không đúng dạng: thử bản khác
    }
    if (match.md5 ? copied.md5 === match.md5 : copied.sizeBytes > 0) {
      return place(o.mediaDir, copied, chooseExtension({ kind: "file", fileName: c.fileName, mime: null, url: "" }), null);
    }
    reject(copied);
  }
  return null;
}

/** Ảnh: bản xem trước (JPEG) làm file hiện, bản gốc HD giữ cạnh; không có / hỏng bản xem trước thì dùng bản gốc */
async function storePhoto(o: StoreOptions, match: Extract<ZaloPcMediaMatch, { kind: "photo" }>): Promise<SavedMedia | null> {
  if (match.preview) {
    const preview = await copyIntoTemp(match.preview, o.tempDir);
    const image = imageType(preview.head);
    if (image) {
      const saved = place(o.mediaDir, preview, image.ext, image.mime);
      if (match.original) await keepOriginalBeside(o, saved.rel, match.original);
      return saved;
    }
    reject(preview);
  }
  if (!match.original) return null;
  const original = await copyIntoTemp(match.original, o.tempDir);
  if (sniff(original.head) === "jxl") {
    try {
      return await saveJxlPhotoAsPng({ tempFile: original.tempFile, mediaDir: o.mediaDir, convert: o.convertJxl });
    } catch {
      // Không đổi được sang PNG thì vẫn giữ bản JXL: kho không mất ảnh, chỉ trình duyệt không hiện (như lúc tải)
      return place(o.mediaDir, original, ".jxl", "image/jxl");
    }
  }
  const image = imageType(original.head);
  return image ? place(o.mediaDir, original, image.ext, image.mime) : reject(original);
}

const imageType = (head: Buffer) => {
  const type = sniff(head);
  return type ? IMAGE[type] : undefined;
};

function reject(c: Copied): null {
  fs.rmSync(c.tempFile, { force: true });
  return null;
}

/** Bản gốc HD đặt cạnh file hiện: cùng tên, thêm `.orig` + đuôi của bản gốc (vd `<sha>.orig.jxl`) */
async function keepOriginalBeside(o: StoreOptions, mainRel: string, original: string): Promise<void> {
  const copied = await copyIntoTemp(original, o.tempDir);
  const type = sniff(copied.head);
  const ext = type === "jxl" ? ".jxl" : imageType(copied.head)?.ext;
  if (!ext) return void reject(copied);
  placeDownloadedFile(copied.tempFile, path.join(o.mediaDir, mainRel.replace(/\.[a-z0-9]+$/i, `.orig${ext}`)));
}

/** File Zalo PC không có dò trong bộ nhớ rất nhanh: cứ chừng này file thì nhường vòng lặp sự kiện một lần */
const YIELD_EVERY = 500;

export type ImportOptions = {
  db: DatabaseSync;
  mediaDir: string;
  downloadsDir: string;
  /** Các thư mục `Zalo Received Files` (Zalo PC bản cũ) để dò file theo tên + cỡ */
  receivedDirs?: string[];
  selfUid: string;
  log: Logger;
  /** Đổi JXL sang PNG; bỏ trống = đổi ngay ở luồng đang chạy (chặn vài giây mỗi ảnh - chỉ hợp cho lệnh chạy một lần / test) */
  convertJxl?: ConvertJxlToPng;
  /** Số file chép / đổi cùng lúc (mặc định 1); nên bằng số luồng của pool đổi JXL */
  concurrency?: number;
  shouldAbort?: () => boolean;
  onProgress?: (p: ZaloPcImportProgress) => void;
};

/** Chép + kiểm + đánh dấu một file có bản Zalo PC, cộng vào tiến độ chung */
async function recoverOne(o: ImportOptions, store: StoreOptions, c: RecoveryCandidate, match: ZaloPcMediaMatch, p: ZaloPcImportProgress): Promise<void> {
  try {
    const saved = await storeMatch(store, c, match);
    if (!saved) p.rejected++;
    else if (markAttachmentRecovered(o.db, c.id, { localPath: saved.rel, sha256: saved.sha256, sizeBytes: saved.sizeBytes, mime: saved.mime }, ZALO_PC_SOURCE, new Date().toISOString())) p.recovered++;
  } catch (err) {
    p.failed++;
    o.log.warn({ id: c.id, kind: c.kind, err }, "Không chép được bản Zalo PC của file");
  }
  p.processed++;
  o.onProgress?.({ ...p });
}

export async function importMediaFromZaloPc(o: ImportOptions): Promise<ZaloPcImportProgress> {
  const index = buildZaloPcMediaIndex(o.downloadsDir, o.receivedDirs);
  const candidates = failedAttachmentsForRecovery(o.db);
  const p: ZaloPcImportProgress = { total: candidates.length, processed: 0, recovered: 0, notFound: 0, rejected: 0, failed: 0 };
  const store: StoreOptions = {
    mediaDir: o.mediaDir,
    tempDir: path.join(o.mediaDir, ".tmp"),
    convertJxl: o.convertJxl ?? (async (bytes) => convertJxlToPng(bytes)),
  };
  const limit = Math.max(1, Math.floor(o.concurrency ?? 1));
  const inFlight = new Set<Promise<void>>();
  let sinceYield = 0;
  o.onProgress?.({ ...p });
  for (const c of candidates) {
    if (o.shouldAbort?.()) break;
    const match = findZaloPcMedia(index, c, o.selfUid);
    if (!match) {
      p.notFound++;
      p.processed++;
      o.onProgress?.({ ...p });
      if (++sinceYield >= YIELD_EVERY) {
        sinceYield = 0;
        await new Promise((r) => setImmediate(r));
      }
      continue;
    }
    const task: Promise<void> = recoverOne(o, store, c, match, p).finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= limit) await Promise.race(inFlight);
  }
  await Promise.all(inFlight);
  return p;
}
