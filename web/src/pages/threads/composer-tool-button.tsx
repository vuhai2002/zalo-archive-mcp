import type { ReactNode } from "react";

/**
 * Nút trên hàng công cụ của khung soạn, theo số đo trên Zalo Web: 32x32 bo 3px, icon 24px màu chữ chính, tên hiện khi rê
 * chuột; rê chuột nền xám nhạt, đang bật nền xanh nhạt + icon xanh.
 */
export function ComposerToolButton({
  title,
  active = false,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? "bg-[#e5f1ff] text-[#005ae0] dark:bg-zalo-500/15 dark:text-zalo-500" : "text-ink hover:bg-[#e5e7eb] dark:hover:bg-tile"
      }`}
    >
      {children}
    </button>
  );
}
