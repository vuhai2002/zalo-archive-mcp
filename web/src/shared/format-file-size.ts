/** "1,2 MB" từ số byte; null/âm thì "-" (server chưa biết cỡ file) */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
}
