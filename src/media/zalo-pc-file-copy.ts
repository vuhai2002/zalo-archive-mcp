import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Chép một file của Zalo PC sang file tạm của kho: nguồn chỉ MỞ ĐỂ ĐỌC (CLAUDE.md), vừa chép vừa băm sha256 + md5 và
 * giữ 16 byte đầu để nhận loại file.
 *
 * File trong `fileNoise` bị Zalo PC "làm nhiễu" (kiểm trên các cặp có bản sạch, Zalo PC 26.11.10): 100 byte đầu XOR với
 * 0x93, phần còn lại giữ nguyên, cuối file thêm 6 byte `07 7a 41 6c 4f 07` ("zAlO"). `denoise` trả lại bản gốc;
 * người gọi kiểm MD5 với checksum Zalo ghi trong tin (tên file trong `fileNoise` chính là checksum đó).
 */
export type Copied = { tempFile: string; sha256: string; md5: string; sizeBytes: number; head: Buffer };
export type Sniffed = "jpeg" | "png" | "gif" | "webp" | "jxl" | "mp4" | "aac" | null;

export const NOISE_TRAILER = Buffer.from([0x07, 0x7a, 0x41, 0x6c, 0x4f, 0x07]);
const NOISE_PREFIX = 100;
const NOISE_KEY = 0x93;

export function sniff(h: Buffer): Sniffed {
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpeg";
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (h.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if ((h[0] === 0xff && h[1] === 0x0a) || h.subarray(4, 8).toString("latin1") === "JXL ") return "jxl";
  if (h.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  // Tin thoại Zalo: AAC dạng ADTS (12 bit đồng bộ 0xFFF, layer 00)
  if (h[0] === 0xff && h[1] !== undefined && (h[1] & 0xf6) === 0xf0) return "aac";
  return null;
}

/** 6 byte cuối của file có đúng dấu "zAlO" của Zalo PC không (chỉ đọc) */
export function hasNoiseTrailer(src: string): boolean {
  const fd = fs.openSync(src, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (size < NOISE_TRAILER.length) return false;
    const tail = Buffer.alloc(NOISE_TRAILER.length);
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    return tail.equals(NOISE_TRAILER);
  } finally {
    fs.closeSync(fd);
  }
}

export async function copyIntoTemp(src: string, tempDir: string, o: { denoise?: boolean } = {}): Promise<Copied> {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${crypto.randomUUID()}.part`);
  const sha = crypto.createHash("sha256");
  const md5 = crypto.createHash("md5");
  let sizeBytes = 0;
  let head = Buffer.alloc(0);
  // Bỏ nhiễu: đọc tới trước 6 byte dấu cuối (`end` tính cả byte đó); file gốc rỗng thì không đọc gì
  let end: number | undefined;
  if (o.denoise) {
    if (!hasNoiseTrailer(src)) throw new Error("File không có dấu làm nhiễu của Zalo PC");
    end = fs.statSync(src).size - NOISE_TRAILER.length - 1;
  }
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (o.denoise && sizeBytes < NOISE_PREFIX) {
        chunk = Buffer.from(chunk);
        for (let i = 0; i < chunk.length && sizeBytes + i < NOISE_PREFIX; i++) chunk[i]! ^= NOISE_KEY;
      }
      if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
      sizeBytes += chunk.length;
      sha.update(chunk);
      md5.update(chunk);
      done(null, chunk);
    },
  });
  try {
    const source = end !== undefined && end < 0 ? emptyStream() : fs.createReadStream(src, { flags: "r", end });
    await pipeline(source, meter, fs.createWriteStream(tempFile, { mode: 0o600 }));
  } catch (err) {
    fs.rmSync(tempFile, { force: true });
    throw err;
  }
  return { tempFile, sha256: sha.digest("hex"), md5: md5.digest("hex"), sizeBytes, head };
}

async function* emptyStream(): AsyncGenerator<Buffer> {}
