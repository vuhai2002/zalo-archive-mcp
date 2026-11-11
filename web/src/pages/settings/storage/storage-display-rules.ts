import type { StorageFile, StorageOverviewResponse, StorageTab } from "../../../archive-api-types";

type Disk = NonNullable<StorageOverviewResponse["disk"]>;

/** Tổng dung lượng kho trên ổ (như số dung lượng to của Zalo PC): media + DB + nhật ký + bản sao cũ + thư mục tạm */
export function archiveTotalBytes(d: Disk): number {
  return d.mediaBytes + d.databaseBytes + d.journalBytes + d.tempBytes + d.backups.reduce((s, b) => s + b.bytes, 0);
}

/** Thanh ổ đĩa như Zalo PC: phần kho, phần ứng dụng khác, phần còn trống (phần trăm, cộng lại 100) */
export function driveBarParts(d: Disk): { archive: number; other: number; free: number } {
  const total = d.drive.totalBytes;
  if (total <= 0) return { archive: 0, other: 0, free: 100 };
  const archive = Math.min(100, (archiveTotalBytes(d) / total) * 100);
  const free = Math.min(100 - archive, (d.drive.freeBytes / total) * 100);
  return { archive, other: Math.max(0, 100 - archive - free), free };
}

/** Ổ đĩa của thư mục kho (vd "D:") để hiện "Vị trí lưu trữ" như Zalo PC; đường dẫn không có ổ thì hiện cả đường dẫn */
export function driveLabel(location: string): string {
  const m = /^([a-zA-Z]:)[\\/]/.exec(location);
  return m ? `Ổ ${m[1]!.toUpperCase()}` : location;
}

// Link "Lưu về máy" dùng chung với khung chat
export { downloadUrlOf } from "../../../shared/same-origin-media-url";

export const TAB_LABELS: Array<[StorageTab, string]> = [
  ["all", "Tất cả"],
  ["photo", "Ảnh"],
  ["video", "Video"],
  ["file", "File"],
  ["voice", "Tin nhắn thoại"],
];

export type PreviewKind = "image" | "video" | "audio" | "file";

// Chỉ những đuôi trình duyệt tự xem / phát được; còn lại (heic, avi, mkv, amr, pdf...) hiện thẻ file + Mở trong tab mới
const PREVIEW_EXTS: Array<[PreviewKind, string[]]> = [
  ["image", ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]],
  ["video", ["mp4", "m4v", "webm", "mov"]],
  ["audio", ["mp3", "m4a", "wav", "aac", "ogg", "flac"]],
];

/** Cửa sổ xem nhanh hiện file theo kiểu nào: ảnh / video / tin thoại theo loại Zalo; file gửi dạng "file" thì theo đuôi tên */
export function previewKind(f: { kind: StorageFile["kind"]; fileName: string | null }): PreviewKind {
  if (f.kind === "photo" || f.kind === "gif") return "image";
  if (f.kind === "video") return "video";
  if (f.kind === "voice") return "audio";
  const ext = /\.([a-z0-9]{1,5})$/i.exec(f.fileName?.trim() ?? "")?.[1]?.toLowerCase();
  return PREVIEW_EXTS.find(([, exts]) => ext && exts.includes(ext))?.[0] ?? "file";
}

/** "04:09" / "1:02:03" từ số mili giây (thời lượng video như Zalo) */
export function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "29/10" từ "2026-10-29"; khác năm với ngày kia thì kèm năm */
const dayMonth = (day: string, withYear: boolean) => {
  const [y, m, d] = day.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
};

/**
 * Dòng mô tả nhật ký tin thô: "5 ngày (01/03 - 05/03)" (một ngày thì "1 ngày (11/11)"); số đo lưu từ bản cũ chưa có số
 * ngày thì "Mỗi ngày một file".
 */
export function journalRangeText(days: Disk["journalDays"]): string {
  if (!days?.count || !days.first || !days.last) return "Mỗi ngày một file";
  const withYear = days.first.slice(0, 4) !== days.last.slice(0, 4);
  const range = days.first === days.last ? dayMonth(days.last, false) : `${dayMonth(days.first, withYear)} - ${dayMonth(days.last, withYear)}`;
  return `${days.count} ngày (${range})`;
}
