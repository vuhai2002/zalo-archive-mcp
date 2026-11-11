/**
 * Luật cho file Word (.docx) xem ngay trong kho (`docx-document-frame.tsx`). Module thuần.
 */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * File Word đời mới (.docx) kho đọc được: theo đuôi tên, hoặc kiểu file Zalo gửi kèm. File .doc đời cũ (định dạng nhị phân)
 * và .docm (có macro) không tính - vẫn tải về như trước.
 */
export function isDocxFile(fileName: string | null | undefined, mime: string | null | undefined): boolean {
  if (/\.docx$/i.test(fileName?.trim() ?? "")) return true;
  return mime?.toLowerCase().split(";")[0]?.trim() === DOCX_MIME;
}

/**
 * Link ngoài trong file Word chỉ giữ khi là http / https / mailto, trả về dạng đã chuẩn hóa; còn lại (javascript:, file:,
 * data:, đường dẫn tương đối, rỗng) trả null để gỡ link - file do người khác gửi, bấm vào không được chạy gì trên dashboard.
 */
export function safeDocxLinkHref(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? u.href : null;
  } catch {
    return null;
  }
}
