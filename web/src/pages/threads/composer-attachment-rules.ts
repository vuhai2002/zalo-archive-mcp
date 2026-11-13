/**
 * Luật file gửi từ khung soạn tin (khớp máy chủ: src/outbox/dashboard-upload-store.ts + resolve-outbox-files.ts). Nút Gửi hình
 * ảnh chỉ nhận ảnh Zalo gửi được thành chùm (jpg, png, webp, gif); nút Đính kèm File nhận mọi file. Module thuần.
 */
export type SendAs = "photo" | "file";
export const MAX_FILES_PER_SEND = 10;
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
const PHOTO_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
/** Cho ô chọn file của nút Gửi hình ảnh */
export const PHOTO_ACCEPT = PHOTO_EXT.join(",");

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};
export const isPhotoName = (name: string) => PHOTO_EXT.includes(extOf(name));

/** Dán / kéo thả: ảnh vào chùm ảnh, file khác thành thẻ file */
export const sendAsForPasted = (name: string): SendAs => (isPhotoName(name) ? "photo" : "file");

/** Dán / kéo thả: mỗi file tự vào chùm ảnh hay thành thẻ file theo đuôi; `already` = số file đã nằm trong khay */
export function pasteProblem(files: Array<{ name: string; size: number }>, already: number): string | null {
  if (files.length + already > MAX_FILES_PER_SEND) return `Mỗi lần gửi tối đa ${MAX_FILES_PER_SEND} file.`;
  for (const f of files) {
    const problem = pickProblem([f], sendAsForPasted(f.name));
    if (problem) return problem;
  }
  return null;
}

/** Lý do không gửi được các file này (null = gửi được); `already` = số file đã có sẵn trong khay */
export function pickProblem(files: Array<{ name: string; size: number }>, as: SendAs, already = 0): string | null {
  if (files.length === 0) return "Chưa chọn file nào.";
  if (files.length + already > MAX_FILES_PER_SEND) return `Mỗi lần gửi tối đa ${MAX_FILES_PER_SEND} file.`;
  for (const f of files) {
    if (!extOf(f.name)) return `"${f.name}" không có đuôi file - Zalo cần đuôi để biết loại file.`;
    if (f.size === 0) return `"${f.name}" rỗng (0 byte).`;
    if (f.size > MAX_FILE_BYTES) return `"${f.name}" quá lớn (tối đa ${MAX_FILE_BYTES / 1048576} MB).`;
    if (as === "photo" && !isPhotoName(f.name)) return `"${f.name}" không phải ảnh - gửi bằng nút Đính kèm File.`;
  }
  return null;
}
