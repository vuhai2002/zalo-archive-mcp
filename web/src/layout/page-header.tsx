import type { ReactNode } from "react";
import type { IconFn } from "../shared/dashboard-icons";

/** Header trang: ô icon + title + subtitle, slot phải cho action/chip */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  aside,
}: {
  icon: IconFn;
  title: string;
  subtitle: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zalo-50 text-zalo-500">
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-0.5 text-[14px] text-ink-soft">{subtitle}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}
