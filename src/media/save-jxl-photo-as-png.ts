import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mediaRelativePath } from "./media-file-naming.js";
import { removePathSync } from "../shared/remove-path-sync.js";

export type SavedMedia = { rel: string; sha256: string; sizeBytes: number; mime: string | null };

/** Đổi byte ảnh JXL sang PNG - thường chạy ở luồng phụ (`JxlPngWorkerPool`) để không chặn daemon */
export type ConvertJxlToPng = (bytes: Uint8Array) => Promise<Uint8Array>;

/** Đặt file đã tải vào chỗ cuối; file cùng nội dung đã có thì bỏ bản mới (khử trùng theo sha) */
export function placeDownloadedFile(tempFile: string, finalPath: string): void {
  try {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    if (fs.existsSync(finalPath)) removePathSync(tempFile, { force: true });
    else fs.renameSync(tempFile, finalPath);
  } catch (err) {
    removePathSync(tempFile, { force: true });
    throw err;
  }
}

/**
 * Ảnh JXL vừa tải (file tạm): đổi sang PNG để trình duyệt / Claude xem được, lưu PNG
 * làm file chính của đính kèm, và giữ file .jxl gốc NGAY CẠNH (cùng tên, đuôi .jxl).
 */
export async function saveJxlPhotoAsPng(o: {
  tempFile: string;
  mediaDir: string;
  convert: ConvertJxlToPng;
}): Promise<SavedMedia> {
  const png = await o.convert(new Uint8Array(fs.readFileSync(o.tempFile)));
  const sha256 = crypto.createHash("sha256").update(png).digest("hex");
  const rel = mediaRelativePath(sha256, ".png");
  const finalPath = path.join(o.mediaDir, rel);
  // PNG ghi qua file tạm rồi đổi tên: chết giữa chừng không để lại ảnh hỏng nửa vời
  const pngTemp = `${o.tempFile}.png.part`;
  fs.writeFileSync(pngTemp, png);
  placeDownloadedFile(pngTemp, finalPath);
  placeDownloadedFile(o.tempFile, finalPath.replace(/\.png$/, ".jxl"));
  return { rel, sha256, sizeBytes: png.length, mime: "image/png" };
}
