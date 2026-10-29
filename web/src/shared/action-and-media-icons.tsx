import { iconBase, type IconProps } from "./dashboard-icons";

/** Icon trạng thái / hành động / loại file - cùng nét với dashboard-icons.tsx */

export const IconClock = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconDatabase = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
    <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="8.7" cy="9.7" r="1.7" />
    <path d="M4 17.5 9 12l3.5 3.5L17 11l3 3.5" />
  </svg>
);

export const IconFileText = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M13.5 3.5V8H18" />
    <path d="M8.5 12.5h7M8.5 16h5" />
  </svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </svg>
);

export const IconSend = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5Z" />
  </svg>
);

export const IconQr = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
    <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" />
  </svg>
);

export const IconPlay = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7Z" />
  </svg>
);

export const IconStop = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
  </svg>
);
