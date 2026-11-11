/**
 * Kiểu file (MIME) đoán theo đuôi tên, CHỈ cho các loại trình duyệt tự xem / phát được mà không chạy mã: PDF, nhạc, video,
 * ảnh thường, văn bản thuần. Phần lớn file trong kho (lấy từ Zalo PC, bản sao lưu điện thoại) không mang kiểu file nên
 * trước đây trình duyệt chỉ tải về; có kiểu đúng thì PDF mở trong tab, nhạc / video phát ngay. Không bao giờ đoán ra HTML,
 * SVG hay loại lạ: file do người khác gửi mở trên origin của dashboard là đường chạy script - những loại đó vẫn tải về.
 * Module thuần.
 */
const SAFE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
};

export function safeMimeFromFileName(fileName: string | null | undefined): string | null {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(fileName?.trim() ?? "")?.[1]?.toLowerCase();
  return ext ? (SAFE_BY_EXT[ext] ?? null) : null;
}

/** Kiểu file dùng khi trả / hiện file: kiểu Zalo gửi kèm nếu có (trừ "octet-stream" = không rõ), không thì đoán theo đuôi */
export function effectiveMime(mime: string | null | undefined, fileName: string | null | undefined): string | null {
  const known = mime && mime.toLowerCase() !== "application/octet-stream" ? mime : null;
  return known ?? safeMimeFromFileName(fileName);
}
