import { iconBase, type IconProps } from "./dashboard-icons";

/** Icon các thao tác trên một tin (thanh nút khi rê chuột, menu Thêm) - giống nút trên Zalo PC */

/** Trả lời: dấu ngoặc kép ĐÓNG đặc như Zalo (đầu tròn ở trên, đuôi cong xuống) - hình vẽ là ngoặc mở, xoay nửa vòng */
export const IconQuote = (p: IconProps) => (
  <svg {...iconBase(p)} fill="currentColor" stroke="none">
    <path transform="rotate(180 12 12)" d="M5 17.5c-.8 0-1.4-.6-1.4-1.4v-3.6C3.6 9.2 5.2 6.8 8.3 6l.5 1.5c-1.6.6-2.5 1.8-2.7 3.4h1.7c.8 0 1.4.6 1.4 1.4v3.8c0 .8-.6 1.4-1.4 1.4H5Zm8.6 0c-.8 0-1.4-.6-1.4-1.4v-3.6c0-3.3 1.6-5.7 4.7-6.5l.5 1.5c-1.6.6-2.5 1.8-2.7 3.4h1.7c.8 0 1.4.6 1.4 1.4v3.8c0 .8-.6 1.4-1.4 1.4h-2.8Z" />
  </svg>
);

/** Chuyển tiếp (Chia sẻ): mũi tên cong sang phải, đặc như Zalo */
export const IconForward = (p: IconProps) => (
  <svg {...iconBase(p)} fill="currentColor" stroke="none">
    <path d="M13.5 5.2a.8.8 0 0 1 1.3-.6l6.6 5.8a.8.8 0 0 1 0 1.2l-6.6 5.8a.8.8 0 0 1-1.3-.6v-3c-4.3 0-7.1 1.2-9.1 4.1-.3.4-.9.2-.9-.3.5-5 3.4-8.9 10-9.6V5.2Z" />
  </svg>
);

export const IconMore = (p: IconProps) => (
  <svg {...iconBase(p)} fill="currentColor" stroke="none">
    <circle cx="6" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="18" cy="12" r="1.6" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
);

/** Chọn nhiều tin: danh sách có dấu tích */
export const IconListCheck = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="m4 6.5 1.5 1.5L8.5 5" />
    <path d="m4 13.5 1.5 1.5 3-3" />
    <path d="M11.5 6.5h8.5M11.5 13.5h8.5M11.5 19h8.5" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    <path d="M10 11v5.5M14 11v5.5" />
  </svg>
);
