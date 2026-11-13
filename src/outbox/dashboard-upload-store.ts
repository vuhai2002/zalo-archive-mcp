import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { containsUnsafeControlChars } from "../shared/terminal-safe-text.js";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";
import { MAX_FILE_BYTES, MAX_FILES } from "./resolve-outbox-files.js";

/**
 * File người dùng chọn / dán trên dashboard để gửi qua Zalo. Trình duyệt tải TỪNG file lên (thân yêu cầu là dữ liệu thô),
 * máy chủ ghi thẳng xuống ổ trong thư mục chép file chờ gửi của nick (`outbox-files/<mã>/`), không giữ cả file trong bộ nhớ.
 * Sau đó yêu cầu gửi chỉ mang mã tải lên; đổi mã -> mục gửi ở đây. Thư mục không còn mục chờ gửi nào dùng thì vòng dọn
 * `sweepStagedFiles` xóa (thư mục mới tải chưa kịp gửi được giữ một thời gian, xem đó).
 */
export type UploadedFile = { uploadId: string; name: string; size: number };
/** `photo` = gửi vào chùm ảnh (nút Gửi hình ảnh); `file` = thẻ file, kể cả ảnh / video (nút Đính kèm File) */
export type UploadUse = { id: string; as: "photo" | "file" };

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const META_FILE = "meta.json";
const MAX_NAME_LENGTH = 200;

export class UploadRejected extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message);
  }
}

/** Tên hiển thị trên Zalo: chỉ phần tên file, bỏ khoảng trắng hai đầu; phải có đuôi để Zalo biết loại file */
export function cleanUploadName(raw: string | undefined): string {
  const name = path.basename(String(raw ?? "").replace(/\\/g, "/")).trim();
  if (!name || name === "." || name === "..") throw new UploadRejected("Thiếu tên file.");
  if (name.length > MAX_NAME_LENGTH) throw new UploadRejected(`Tên file dài quá ${MAX_NAME_LENGTH} ký tự.`);
  if (containsUnsafeControlChars(name)) throw new UploadRejected("Tên file chứa ký tự điều khiển.");
  if (!path.extname(name) || path.extname(name) === name) throw new UploadRejected(`"${name}" không có đuôi file - Zalo cần đuôi để biết loại file.`);
  return name;
}

/** Ghi một file tải lên; quá trần cỡ hay rỗng thì xóa phần đã ghi và báo lỗi */
export async function saveUpload(
  stagingDir: string,
  rawName: string | undefined,
  body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array> | null,
  declaredBytes: number | null,
  maxBytes: number = MAX_FILE_BYTES,
): Promise<UploadedFile> {
  const name = cleanUploadName(rawName);
  const tooBig = () => new UploadRejected(`"${name}" quá lớn (tối đa ${Math.round(maxBytes / 1048576)} MB).`, 413);
  if (declaredBytes !== null && declaredBytes > maxBytes) throw tooBig();
  if (!body) throw new UploadRejected(`"${name}" rỗng (0 byte).`);

  const uploadId = randomUUID();
  const dir = path.join(stagingDir, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  let size = 0;
  try {
    const counter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.length;
        done(size > maxBytes ? tooBig() : null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), counter, fs.createWriteStream(path.join(dir, fileOf(name))));
    if (size === 0) throw new UploadRejected(`"${name}" rỗng (0 byte).`);
    fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify({ name, size }));
    return { uploadId, name, size };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/** Tên file trên ổ: cố định theo đuôi (tên gốc chỉ nằm trong meta, không thành đường dẫn) */
const fileOf = (name: string) => `upload${path.extname(name).toLowerCase()}`;

/** Mã tải lên -> mục gửi; mã lạ / đã bị dọn / ảnh không phải ảnh thì báo lỗi, không mục nào được tạo */
export function resolveUploads(stagingDir: string, uses: UploadUse[]): OutboxFile[] {
  if (uses.length > MAX_FILES) throw new UploadRejected(`Mỗi lần gửi tối đa ${MAX_FILES} file.`);
  if (new Set(uses.map((u) => u.id)).size !== uses.length) throw new UploadRejected("Một file được gửi hai lần trong cùng tin.");
  return uses.map((u) => {
    if (!UPLOAD_ID.test(u.id) || (u.as !== "photo" && u.as !== "file")) throw new UploadRejected("Mã file tải lên không hợp lệ.");
    const dir = path.join(stagingDir, u.id);
    let meta: { name?: unknown; size?: unknown };
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, META_FILE), "utf8")) as typeof meta;
    } catch {
      throw new UploadRejected("Không thấy file đã tải lên (đã quá lâu chưa gửi?) - chọn lại file.");
    }
    const name = cleanUploadName(String(meta.name ?? ""));
    const filePath = path.join(dir, fileOf(name));
    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (size === 0) throw new UploadRejected(`Không thấy file "${name}" đã tải lên - chọn lại file.`);
    if (u.as === "photo" && !PHOTO_EXT.has(path.extname(name).toLowerCase())) {
      throw new UploadRejected(`"${name}" không phải ảnh - gửi bằng nút Đính kèm File.`);
    }
    return { path: filePath, name, size, kind: u.as === "photo" ? "image" : "file" };
  });
}
