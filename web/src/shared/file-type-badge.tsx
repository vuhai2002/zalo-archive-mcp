import { IconFileText, IconImage, IconPlay } from "./action-and-media-icons";
import { iconBase, type IconProps } from "./dashboard-icons";
import { fileTypeOfName, type FileTone } from "./file-type-of-name";

const TONE: Record<FileTone, string> = {
  purple: "bg-[#7b61ff]",
  red: "bg-[#f04438]",
  blue: "bg-[#2e72ff]",
  green: "bg-[#12a150]",
  orange: "bg-[#f97a1f]",
  teal: "bg-[#14b8a6]",
  gray: "bg-[#8a94a6]",
};

const IconMusic = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

/** Khóa kéo của file nén, như biểu tượng Zalo */
const IconZip = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M12 3v2M12 7v2M12 11v2" />
    <rect x="9.5" y="14" width="5" height="6" rx="1" />
  </svg>
);

/** Ô màu theo loại file (đuôi tên) như danh sách file của Zalo: icon hoặc chữ viết tắt trên nền màu */
export function FileTypeBadge({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  const t = fileTypeOfName(name);
  const icon = Math.round(size * 0.5);
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg text-white ${TONE[t.tone]}`}
      aria-hidden="true"
    >
      {t.label ? (
        <span className="text-[13px] font-bold tracking-tight">{t.label}</span>
      ) : t.icon === "zip" ? (
        <IconZip size={icon} />
      ) : t.icon === "audio" ? (
        <IconMusic size={icon} />
      ) : t.icon === "video" ? (
        <IconPlay size={icon} />
      ) : t.icon === "image" ? (
        <IconImage size={icon} />
      ) : (
        <IconFileText size={icon} />
      )}
    </span>
  );
}
