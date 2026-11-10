import { iconBase, type IconProps } from "./dashboard-icons";

/**
 * Biểu tượng vẽ theo hình Zalo PC (đo từ ảnh chụp): dòng xem trước trong danh sách hội thoại (ảnh, video, sticker, tin thoại),
 * biểu tượng nhóm trước tên nhóm, và biểu tượng tin nhắn của thanh bên (nét khi chưa chọn, đặc khi đang chọn).
 */

/** Ảnh: khung vuông bo góc, chấm tròn góc trên, đường sóng ở dưới */
export const IconZaloImage = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <circle cx="8.4" cy="8.4" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3.8 16.6c2-2.3 3.6-3.4 5.2-3.4 1.8 0 2.7 1.6 4.4 1.6 1.4 0 2.4-.9 3.4-2.1 1-1.1 2.1-1.4 3.4-1" />
  </svg>
);

/** Video: chữ nhật nằm ngang bo góc, tam giác phát bên trong */
export const IconZaloVideo = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="2.8" y="5" width="18.4" height="14" rx="2.6" />
    <path d="M10 9.1v5.8l4.7-2.9Z" />
  </svg>
);

/** Sticker: ô vuông bo góc có góc gấp phía trên phải, mặt cười */
export const IconZaloSticker = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M14.6 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h10a3.5 3.5 0 0 0 3.5-3.5V9.4Z" />
    <path d="M14.6 3.5v2.7a3.2 3.2 0 0 0 3.2 3.2h2.7" />
    <path d="M9.2 10v1.2M14.8 10v1.2" />
    <path d="M8.4 14.2c.9 1.4 2.1 2.1 3.6 2.1s2.7-.7 3.6-2.1Z" />
  </svg>
);

/** Tin nhắn thoại: micro */
export const IconZaloVoice = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="9" y="3.2" width="6" height="10.8" rx="3" />
    <path d="M5.6 11a6.4 6.4 0 0 0 12.8 0M12 17.4V20.8M8.8 20.8h6.4" />
  </svg>
);

/** Nhóm: ba người dạng đặc, người giữa to hơn (trước tên nhóm trong danh sách, như Zalo PC) */
export const IconZaloGroup = (p: IconProps) => (
  <svg {...iconBase(p)} fill="currentColor" stroke="none">
    <circle cx="12" cy="7.4" r="3.4" />
    <path d="M6.6 18.6c.4-3.4 2.5-5.2 5.4-5.2s5 1.8 5.4 5.2a.8.8 0 0 1-.8.9H7.4a.8.8 0 0 1-.8-.9Z" />
    <circle cx="5" cy="9.9" r="2.4" />
    <path d="M1.4 18.3c.2-2.4 1.5-3.8 3.6-4a7.3 7.3 0 0 0-.9 5H2.2a.8.8 0 0 1-.8-.9Z" />
    <circle cx="19" cy="9.9" r="2.4" />
    <path d="M22.6 18.3c-.2-2.4-1.5-3.8-3.6-4a7.3 7.3 0 0 1 .9 5h1.9a.8.8 0 0 0 .8-.9Z" />
  </svg>
);

/** Tin nhắn ở thanh bên: bong bóng thoại; đang chọn thì đặc trắng kèm hai vạch chữ màu ô chọn như Zalo PC */
export function IconZaloChat({ active = false, ...p }: IconProps & { active?: boolean }) {
  const bubble = "M12 3.4c-5 0-9 3.5-9 7.8 0 2.4 1.2 4.5 3.1 5.9l-.6 3.4 3.6-1.8c.9.3 1.9.4 2.9.4 5 0 9-3.5 9-7.9S17 3.4 12 3.4Z";
  if (!active) {
    return (
      <svg {...iconBase(p)}>
        <path d={bubble} />
      </svg>
    );
  }
  return (
    <svg {...iconBase(p)}>
      <path d={bubble} fill="currentColor" />
      <path d="M8.3 10h6.6M8.3 13.1h4" className="text-[#0544a8] dark:text-[#071c3d]" stroke="currentColor" strokeWidth={1.9} />
    </svg>
  );
}
