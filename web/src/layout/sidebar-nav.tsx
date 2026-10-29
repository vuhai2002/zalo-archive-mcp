import { NavLink } from "react-router-dom";
import type { SessionStatus } from "../archive-api-types";
import {
  IconArchive,
  IconChat,
  IconClose,
  IconGear,
  IconGrid,
  IconInbox,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSignal,
  IconSun,
  IconWarning,
  type IconFn,
} from "../shared/dashboard-icons";
import { sessionShortText, sessionTone, TONE_DOT_CLASS } from "../shared/session-state-labels";
import { useTheme } from "../shared/use-theme";
import type { KillSwitchState } from "./dashboard-shell-context";

/**
 * Sidebar theo mẫu zalo-agent. Từ lg trở lên: cột cố định cao đúng một màn hình
 * (`lg:h-screen` - không có trần thì cửa sổ thấp làm cả document cuộn và sidebar
 * trôi mất logo). Dưới lg: drawer trượt từ trái, mở bằng nút hamburger ở topbar.
 */

const NAV_ITEMS: { to: string; label: string; icon: IconFn }[] = [
  { to: "/", label: "Tổng quan", icon: IconGrid },
  { to: "/threads", label: "Hội thoại", icon: IconChat },
  { to: "/search", label: "Tìm kiếm", icon: IconSearch },
  { to: "/outbox", label: "Hàng đợi", icon: IconInbox },
  { to: "/zalo", label: "Tài khoản Zalo", icon: IconSignal },
  { to: "/settings", label: "Cài đặt", icon: IconGear },
];

export function SidebarNav({
  session,
  killSwitch,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: {
  session: SessionStatus | null;
  killSwitch: KillSwitchState | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { theme, toggle } = useTheme();
  const tone = sessionTone(session);
  /** Nick đang dùng - đổi nick là thấy ngay ở chân sidebar */
  const nickName = session?.account?.displayName ?? session?.displayName ?? session?.account?.id ?? null;

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:z-auto lg:h-screen lg:w-60 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <NavLink to="/" onClick={onCloseMobile} className="flex items-center gap-2.5" title="Về trang chính">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zalo-500 text-white">
              <IconArchive size={20} />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-ink">Kho Zalo</span>
          </NavLink>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
            className="ml-auto rounded-lg p-1.5 text-ink-soft hover:bg-tile lg:hidden"
          >
            <IconClose size={17} />
          </button>
        </div>

        <nav className="mt-1 flex-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-colors ${
                  isActive ? "bg-zalo-50 font-medium text-zalo-700" : "text-ink-soft hover:bg-tile hover:text-ink"
                }`
              }
            >
              <item.icon size={17} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.to === "/zalo" && <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT_CLASS[tone]}`} />}
            </NavLink>
          ))}
        </nav>

        {/* Khóa khẩn cấp đang bật thì mọi tin đều đứng: phải thấy được ở MỌI trang */}
        {killSwitch?.killed && (
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            className="mx-3 mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <IconWarning size={16} className="mt-px shrink-0" />
            <span>Khóa khẩn cấp đang BẬT - không tin nào được gửi</span>
          </NavLink>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span
            className="flex min-w-0 items-center gap-2 text-[12px] text-ink-soft"
            title={`${nickName ? `${nickName} - ` : ""}${sessionShortText(session)} - v${__APP_VERSION__}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT_CLASS[tone]}`} />
            <span className="truncate">
              {nickName ? `${nickName} · ` : ""}
              {sessionShortText(session)}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={toggle}
              title={theme === "dark" ? "Đang tối - bấm để chuyển sáng" : "Đang sáng - bấm để chuyển tối"}
              aria-label="Đổi giao diện sáng/tối"
              className="rounded-lg p-1.5 text-ink-soft hover:bg-tile hover:text-ink"
            >
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất khỏi dashboard"
              aria-label="Đăng xuất khỏi dashboard"
              className="rounded-lg p-1.5 text-ink-soft hover:bg-tile hover:text-ink"
            >
              <IconLogout size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
