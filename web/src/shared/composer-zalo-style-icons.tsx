import { iconBase, type IconProps } from "./dashboard-icons";

/**
 * Icon khung soạn tin vẽ theo DÁNG icon của Zalo PC / Zalo Web (khung ảnh, kẹp giấy, chữ A có bút, thanh định dạng) cho người
 * dùng quen tay. Tự vẽ bằng nét, cùng kiểu với dashboard-icons.tsx - không chép font icon của Zalo.
 */

export const IconZaloPhoto = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="8.6" cy="9.4" r="1.6" />
    <path d="M4 16.8 8.8 12l3.6 3.6 2.6-2.6 5 5" />
  </svg>
);

export const IconZaloAttach = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="m15.4 7.6-6.9 6.9a1.8 1.8 0 0 0 2.5 2.5l7.4-7.4a3.6 3.6 0 0 0-5.1-5.1l-7.5 7.5a5.4 5.4 0 0 0 7.6 7.6l6.5-6.5" />
  </svg>
);

/** Chữ A có cây bút: bật / tắt thanh Định dạng tin nhắn */
export const IconZaloTextFormat = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M3.5 18 8.5 5l5 13M5.4 13.4h6.2" />
    <path d="m13.8 20.2.9-3.1 5-5a1.4 1.4 0 0 1 2 2l-5 5Z" />
  </svg>
);

export const IconZaloBold = (p: IconProps) => (
  <svg {...iconBase({ strokeWidth: 2.4, ...p })}>
    <path d="M7.5 5h5.2a3.4 3.4 0 0 1 0 6.8H7.5ZM7.5 11.8h6.1a3.6 3.6 0 0 1 0 7.2H7.5Z" />
  </svg>
);

export const IconZaloItalic = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M10.5 5h7M6.5 19h7M14.5 5l-4.5 14" />
  </svg>
);

export const IconZaloUnderline = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M7 4.5v6.5a5 5 0 0 0 10 0V4.5M5.5 20h13" />
  </svg>
);

export const IconZaloStrike = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M16.5 7.3c-.6-1.7-2.3-2.8-4.5-2.8-2.6 0-4.4 1.4-4.4 3.3 0 1.4.9 2.3 2.6 2.9M4.5 12h15M8 16.6c.6 1.8 2.3 2.9 4.4 2.9 2.7 0 4.6-1.4 4.6-3.5 0-.9-.3-1.6-.9-2.2" />
  </svg>
);

/** Hai chữ A to nhỏ: Cỡ chữ */
export const IconZaloFontSize = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M2.8 19 7.6 5.5 12.4 19M4.5 14.6h6.2" />
    <path d="m13.2 19 3.6-9.2 3.6 9.2M14.4 16h4.8" />
  </svg>
);

/**
 * Chữ A có vạch màu sát đáy: Đổi màu chữ. Như Zalo, vạch dài 18 / cao 2 trên icon 20 (đo trên Zalo Web), mang màu đang chọn
 */
export const IconZaloTextColor = ({ color, ...p }: IconProps & { color?: string }) => (
  <svg {...iconBase(p)}>
    <path d="M6.6 16.6 12 3.6l5.4 13M8.7 12.1h6.6" />
    <rect x="1.2" y="20.4" width="21.6" height="2.4" rx="1.2" fill={color ?? "currentColor"} stroke="none" />
  </svg>
);

/** Cục tẩy: Bỏ tất cả định dạng */
export const IconZaloEraser = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M9 19.5h11M4.7 14.8l8.6-8.6a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8l-7.7 7.8H8.4l-3.7-3.6a.8.8 0 0 1 0-1.1ZM8.8 10.7l4.9 4.9" />
  </svg>
);

export const IconZaloBulletList = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="5" cy="6.5" r="1.1" fill="currentColor" />
    <circle cx="5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="5" cy="17.5" r="1.1" fill="currentColor" />
    <path d="M9.5 6.5h10.5M9.5 12h10.5M9.5 17.5h10.5" />
  </svg>
);

export const IconZaloNumberList = (p: IconProps) => (
  <svg {...iconBase({ strokeWidth: 1.5, ...p })}>
    <path d="M4.2 4.6 5.3 4v4M4.1 10.9c.3-.5.7-.8 1.3-.8.7 0 1.2.4 1.2 1 0 .8-.9 1.3-2.5 2.6h2.6M4.1 16.3c.3-.4.7-.6 1.3-.6.7 0 1.1.4 1.1.9s-.5.9-1.1.9c.7 0 1.2.4 1.2 1s-.6 1-1.3 1c-.6 0-1-.2-1.3-.6" />
    <path d="M10 6.5h10M10 12h10M10 17.5h10" strokeWidth={1.7} />
  </svg>
);

export const IconZaloIndent = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M4 5h16M11.5 10h8.5M11.5 14h8.5M4 19h16M4.5 9.5 7.5 12l-3 2.5" />
  </svg>
);

export const IconZaloOutdent = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M4 5h16M11.5 10h8.5M11.5 14h8.5M4 19h16M7.5 9.5 4.5 12l3 2.5" />
  </svg>
);

export const IconZaloUndo = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M9 6.5 5 10.5l4 4M5 10.5h9.5a4.5 4.5 0 0 1 0 9H11" />
  </svg>
);

export const IconZaloRedo = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="m15 6.5 4 4-4 4M19 10.5H9.5a4.5 4.5 0 0 0 0 9H13" />
  </svg>
);

/** Mở rộng ô soạn tin (đang mở rộng thì nút sáng nền, icon giữ nguyên như Zalo) */
export const IconZaloExpand = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5" />
  </svg>
);

/** Mục "Chọn File" của menu kẹp giấy */
export const IconZaloFileOutline = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M7 3.5h6.6L18.5 8.4v11a1.1 1.1 0 0 1-1.1 1.1H7a1.1 1.1 0 0 1-1.1-1.1V4.6A1.1 1.1 0 0 1 7 3.5Z" />
    <path d="M13.5 3.6v4.9h4.9" />
  </svg>
);

/** Mục "Chọn Thư mục" của menu kẹp giấy */
export const IconZaloFolderOutline = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h4.1l2 2.2h7.5a1.7 1.7 0 0 1 1.7 1.7v8.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z" />
  </svg>
);

/** Ô file trong khay chờ gửi: tờ giấy xanh có kẹp giấy trắng (vẽ theo dáng ô file của Zalo PC) */
export const IconZaloFileTile = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={(size * 32) / 26} viewBox="0 0 26 32" aria-hidden="true">
    <path d="M3 0h13l10 10v19a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill="#4db2f2" />
    <path d="M16 0l10 10h-7a3 3 0 0 1-3-3Z" fill="#a6dbfb" />
    <path d="m15.6 14.6-5 5a1.4 1.4 0 0 0 2 2l5.4-5.4a2.6 2.6 0 0 0-3.7-3.7l-5.5 5.5a3.9 3.9 0 0 0 5.5 5.5l4.6-4.6" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
