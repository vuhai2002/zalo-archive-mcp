/**
 * Chọn đuôi file và đường dẫn lưu media. Module thuần.
 *
 * File lưu theo sha256 nên cùng một ảnh được chuyển tiếp nhiều lần chỉ tốn một
 * bản trên đĩa, và tên file không bao giờ lấy từ chữ người gửi đặt (chặn path
 * traversal kiểu "../../x.exe").
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/aac": ".aac",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/amr": ".amr",
  "application/pdf": ".pdf",
};

const DEFAULT_EXT_BY_KIND: Record<string, string> = {
  photo: ".jpg",
  gif: ".gif",
  video: ".mp4",
  voice: ".aac",
  file: ".bin",
};

/** Đuôi an toàn: chỉ chữ/số, tối đa 8 ký tự */
function safeExt(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? `.${m[1]!.toLowerCase()}` : null;
}

export function chooseExtension(opts: { kind: string; fileName: string | null; mime: string | null; url: string }): string {
  let urlPath = "";
  try {
    urlPath = new URL(opts.url).pathname;
  } catch {
    /* URL hỏng thì bỏ qua nguồn này */
  }
  const mime = opts.mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  return safeExt(opts.fileName) ?? EXT_BY_MIME[mime] ?? safeExt(urlPath) ?? DEFAULT_EXT_BY_KIND[opts.kind] ?? ".bin";
}

/** Đường dẫn TƯƠNG ĐỐI trong thư mục media: <2 ký tự đầu sha>/<sha><đuôi> */
export function mediaRelativePath(sha256: string, ext: string): string {
  return `${sha256.slice(0, 2)}/${sha256}${ext}`;
}

/** Host có thuộc danh sách CDN Zalo được phép không (khớp đúng tên hoặc đuôi ".<suffix>") */
export function isAllowedMediaHost(url: string, allowedSuffixes: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return allowedSuffixes.some((s) => host === s || host.endsWith(`.${s}`));
}
