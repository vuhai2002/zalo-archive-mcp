/**
 * Loại file theo đuôi tên, để vẽ ô màu như Zalo: nén / nhạc / video / ảnh có biểu tượng, còn
 * PDF / Word / Excel / PowerPoint / Photoshop / Illustrator có chữ viết tắt. Module thuần.
 */
export type FileTone = "purple" | "red" | "blue" | "green" | "orange" | "teal" | "gray";
export type FileType = { icon: "zip" | "audio" | "video" | "image" | "file" | null; label: string | null; tone: FileTone };

const GROUPS: Array<{ exts: string[]; type: FileType }> = [
  { exts: ["zip", "rar", "7z", "tar", "gz"], type: { icon: "zip", label: null, tone: "purple" } },
  { exts: ["mp3", "m4a", "wav", "aac", "ogg", "flac", "amr"], type: { icon: "audio", label: null, tone: "purple" } },
  { exts: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "3gp"], type: { icon: "video", label: null, tone: "purple" } },
  { exts: ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"], type: { icon: "image", label: null, tone: "teal" } },
  { exts: ["pdf"], type: { icon: null, label: "PDF", tone: "red" } },
  { exts: ["doc", "docx"], type: { icon: null, label: "W", tone: "blue" } },
  { exts: ["xls", "xlsx", "csv"], type: { icon: null, label: "X", tone: "green" } },
  { exts: ["ppt", "pptx"], type: { icon: null, label: "P", tone: "orange" } },
  { exts: ["psd"], type: { icon: null, label: "Ps", tone: "blue" } },
  { exts: ["ai"], type: { icon: null, label: "Ai", tone: "orange" } },
];

export function fileTypeOfName(name: string | null | undefined): FileType {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name?.trim() ?? "")?.[1]?.toLowerCase();
  return GROUPS.find((g) => ext && g.exts.includes(ext))?.type ?? { icon: "file", label: null, tone: "gray" };
}
