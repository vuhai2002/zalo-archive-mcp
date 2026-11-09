import type { StorageOverviewResponse, StorageTab } from "../../../archive-api-types";

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

/** Link "Lưu về máy": thêm download=1 để trình duyệt tải về với tên gốc */
export const downloadUrlOf = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

export const TAB_LABELS: Array<[StorageTab, string]> = [
  ["all", "Tất cả"],
  ["photo", "Ảnh"],
  ["video", "Video"],
  ["file", "File"],
  ["voice", "Tin nhắn thoại"],
];

/** "04:09" / "1:02:03" từ số mili giây (thời lượng video như Zalo) */
export function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
