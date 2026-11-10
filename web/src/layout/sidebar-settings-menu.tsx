import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconDatabase } from "../shared/action-and-media-icons";
import { IconCheck, IconChevronDown, IconGear, IconLogout, IconSun, IconUsers } from "../shared/dashboard-icons";
import { useTheme, type ThemeChoice } from "../shared/use-theme";
import { useDashboardShell } from "./dashboard-shell-context";

const THEMES: Array<[ThemeChoice, string]> = [
  ["light", "Sáng"],
  ["dark", "Tối"],
  ["system", "Theo hệ thống"],
];

/**
 * Nút bánh răng ở đáy thanh bên + menu như Zalo PC: Thông tin tài khoản, Cài đặt, Dữ liệu (Đồng bộ và sao lưu, Quản lý dữ
 * liệu) - đều mở cửa sổ Cài đặt đúng mục -, Giao diện (Sáng / Tối / Theo hệ thống), Đăng xuất (khỏi dashboard).
 * `variant`: "rail" = cột xanh màn rộng (menu mở lên trên, sang phải); "tab" = thanh đáy màn hẹp (menu mở lên trên, canh phải).
 */
export function SidebarSettingsMenu({ variant, onLogout, children }: { variant: "rail" | "tab"; onLogout: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<"data" | "theme" | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { openSettings } = useDashboardShell();
  const { choice, choose } = useTheme();

  useEffect(() => {
    if (!open) return;
    const close = () => (setOpen(false), setSub(null));
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (f: () => void) => () => {
    setOpen(false);
    setSub(null);
    f();
  };

  return (
    <div ref={wrap} className={variant === "tab" ? "relative flex flex-1" : "relative"}>
      <button
        type="button"
        onClick={() => (setOpen((v) => !v), setSub(null))}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Cài đặt"
        aria-label="Cài đặt"
        className={
          variant === "rail"
            ? `relative flex h-12 w-12 items-center justify-center rounded-lg text-white transition-colors hover:bg-black/10 ${open ? "bg-black/25 hover:bg-black/25" : ""}`
            : `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] ${open ? "text-zalo-500" : "text-ink-soft"}`
        }
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-64 rounded-xl border border-line bg-surface py-1.5 text-[15px] text-ink shadow-[0_8px_30px_rgba(0,0,0,0.18)] ${
            variant === "rail" ? "bottom-0 left-full ml-2" : "bottom-full right-1 mb-2"
          }`}
        >
          <Item icon={<IconUsers size={19} />} onClick={run(() => openSettings("account"))}>
            Thông tin tài khoản
          </Item>
          <Item icon={<IconGear size={19} />} onClick={run(() => openSettings("send"))}>
            Cài đặt
          </Item>
          <div className="mx-3 my-1 border-t border-line" />
          <div className="relative">
            <Item icon={<IconDatabase size={19} />} chevron active={sub === "data"} onClick={() => setSub(sub === "data" ? null : "data")}>
              Dữ liệu
            </Item>
            {sub === "data" && (
              <Sub variant={variant}>
                <Item onClick={run(() => openSettings("sync"))}>Đồng bộ và sao lưu</Item>
                <Item onClick={run(() => openSettings("data"))}>Quản lý dữ liệu</Item>
              </Sub>
            )}
          </div>
          <div className="relative">
            <Item icon={<IconSun size={19} />} chevron active={sub === "theme"} onClick={() => setSub(sub === "theme" ? null : "theme")}>
              Giao diện
            </Item>
            {sub === "theme" && (
              <Sub variant={variant}>
                {THEMES.map(([value, label]) => (
                  <Item key={value} onClick={run(() => choose(value))} trailing={choice === value ? <IconCheck size={16} className="text-zalo-500" /> : null}>
                    {label}
                  </Item>
                ))}
              </Sub>
            )}
          </div>
          <div className="mx-3 my-1 border-t border-line" />
          <Item icon={<IconLogout size={19} />} danger onClick={run(onLogout)}>
            Đăng xuất
          </Item>
        </div>
      )}
    </div>
  );
}

/**
 * Menu con: màn rộng mở sang phải như Zalo PC, canh ĐÁY theo mục cha và mọc lên trên (nút bánh răng luôn ở đáy màn hình, canh
 * đỉnh thì menu con của mục dưới cùng bị cắt); màn hẹp hiện ngay dưới mục cha (thụt vào).
 */
function Sub({ variant, children }: { variant: "rail" | "tab"; children: ReactNode }) {
  return variant === "rail" ? (
    <div role="menu" className="absolute -bottom-1.5 left-full ml-2 w-56 rounded-xl border border-line bg-surface py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
      {children}
    </div>
  ) : (
    <div role="menu" className="ml-6 border-l border-line">
      {children}
    </div>
  );
}

function Item({
  icon,
  chevron = false,
  active = false,
  danger = false,
  trailing,
  onClick,
  children,
}: {
  icon?: ReactNode;
  chevron?: boolean;
  active?: boolean;
  danger?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-tile ${active ? "bg-tile" : ""} ${danger ? "text-red-600 dark:text-red-400" : ""}`}
    >
      {icon && <span className={danger ? "" : "text-ink-soft"}>{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
      {chevron && <IconChevronDown size={16} className="-rotate-90 text-ink-soft" />}
    </button>
  );
}
