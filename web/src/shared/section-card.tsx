import type { ReactNode } from "react";
import type { IconFn } from "./dashboard-icons";

/**
 * Panel lớn có header icon + title (+ subtitle) + slot phải.
 * `fill`: thẻ cao đúng bằng khung chứa (khung đặt chiều cao), phần thân cuộn bên trong - danh sách dài không kéo thẻ dài ra.
 * `footer`: dòng ghim ở đáy thẻ, ngoài vùng cuộn (vd "Xem tất cả").
 */
export function SectionCard({
  icon: Icon,
  title,
  subtitle,
  aside,
  fill = false,
  footer,
  children,
}: {
  icon?: IconFn;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  fill?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`gc-card min-w-0 p-5 ${fill ? "flex h-full flex-col" : ""}`}>
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zalo-50 text-zalo-500">
              <Icon size={19} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      {/* -mr-2 pr-2: chừa chỗ thanh cuộn, chữ không dính sát thanh */}
      {fill ? <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div> : children}
      {footer && <div className="shrink-0 pt-2">{footer}</div>}
    </section>
  );
}
