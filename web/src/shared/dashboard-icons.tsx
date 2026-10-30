import type { ReactNode, SVGProps } from "react";

/** Icon stroke 1.7px kiểu Phosphor, currentColor - đủ dùng cho sidebar + tiles */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };
export type IconFn = (p: IconProps) => ReactNode;

export function iconBase({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export const IconGrid = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </svg>
);

export const IconChat = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.36-4.1-1L3 21l1.5-5.4A8.5 8.5 0 1 1 21 12Z" />
  </svg>
);

export const IconMessage = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5v-14Z" />
    <path d="M8.5 9.5h7M8.5 12.5h4.5" />
  </svg>
);

export const IconUsers = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
    <path d="M15.5 6a3 3 0 0 1 0 5.4M17.5 15.2c1.7.5 2.7 1.7 3 3.3" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

/** Khay hàng đợi gửi */
export const IconInbox = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M3.5 13.5 6 5.5A1.5 1.5 0 0 1 7.4 4.5h9.2A1.5 1.5 0 0 1 18 5.5l2.5 8" />
    <path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.5 2.5h-4L8.5 13.5h-5Z" />
  </svg>
);

export const IconSignal = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M6.3 9.5a7 7 0 0 0 0 5M3.5 7a11 11 0 0 0 0 10M17.7 9.5a7 7 0 0 1 0 5M20.5 7a11 11 0 0 1 0 10" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const IconGear = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </svg>
);

export const IconMenu = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M14 4h-7a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 7 20h7" />
    <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
  </svg>
);

export const IconSun = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
  </svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconWarning = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17h.01" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M5.5 3.5l13 17" />
  </svg>
);

/** Bật/tắt bảng thông tin bên phải khung chat (như nút của Zalo PC) */
export const IconPanelRight = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
    <path d="M14.5 4.5v15" />
  </svg>
);

/** Ghim hội thoại (đinh ghim như Zalo) */
export const IconPin = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M14.5 3.5 20.5 9.5l-2.2 1-3.9 3.9-.6 4.1-1.3 1.3-3.2-3.2L5 20.9l-1-1 4.3-4.3-3.2-3.2 1.3-1.3 4.1-.6 3.9-3.9 1.1-2.1Z" />
  </svg>
);
