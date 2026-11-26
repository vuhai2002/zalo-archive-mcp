/**
 * Các dòng của ghi chú phát hành (markdown GitHub Release) đáng hiện trong hộp "Đã có bản mới": bỏ dòng trống, chú thích
 * HTML và dòng "Full Changelog" (link so sánh, đã có nút Xem trên GitHub). Không còn dòng nào thì hộp ẩn luôn mục
 * "Có gì mới", không để một ô trống.
 */
export function visibleReleaseNoteLines(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim()) && !/^\**Full Changelog/i.test(l.trim()));
}
