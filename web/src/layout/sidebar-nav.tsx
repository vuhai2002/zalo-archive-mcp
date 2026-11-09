import { NavLink } from "react-router-dom";
import type { SessionStatus } from "../archive-api-types";
import { ContactAvatar } from "../shared/contact-avatar";
import {
  IconChat,
  IconGear,
  IconGrid,
  IconInbox,
  IconLogout,
  IconMoon,
  IconSignal,
  IconSun,
  IconWarning,
  type IconFn,
} from "../shared/dashboard-icons";
import { sessionShortText, sessionTone, TONE_DOT_CLASS } from "../shared/session-state-labels";
import { useTheme } from "../shared/use-theme";
import type { KillSwitchState } from "./dashboard-shell-context";

/**
 * Thanh icon kiểu Zalo PC: cột xanh hẹp sát mép trái (từ lg), avatar nick đang dùng trên cùng,
 * các mục chỉ có icon (rê chuột hiện tên), dưới cùng là đổi sáng/tối và đăng xuất. Dưới lg: thanh
 * icon nằm ở đáy màn hình, mỗi mục kèm nhãn nhỏ.
 */

const NAV_ITEMS: { to: string; label: string; short: string; icon: IconFn }[] = [
  { to: "/threads", label: "Hội thoại", short: "Tin nhắn", icon: IconChat },
  { to: "/", label: "Tổng quan", short: "Tổng quan", icon: IconGrid },
  { to: "/outbox", label: "Hàng đợi gửi", short: "Hàng đợi", icon: IconInbox },
  { to: "/zalo", label: "Tài khoản Zalo", short: "Nick", icon: IconSignal },
  { to: "/settings", label: "Cài đặt", short: "Cài đặt", icon: IconGear },
];

/** Bấm icon Hội thoại (kể cả khi đang ở đó): đóng hội thoại đang mở, về danh sách đầu trang, thoát chế độ tìm - như Zalo */
const navState = (to: string) => (to === "/threads" ? { resetThreadList: true } : undefined);

const RAIL_BTN = "relative flex h-12 w-12 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white";

export function SidebarNav({
  session,
  killSwitch,
  onLogout,
}: {
  session: SessionStatus | null;
  killSwitch: KillSwitchState | null;
  onLogout: () => void;
}) {
  const { theme, toggle } = useTheme();
  const tone = sessionTone(session);
  const nickName = session?.account?.displayName ?? session?.displayName ?? session?.account?.id ?? "Chưa có nick";
  const statusText = `${nickName} - ${sessionShortText(session)} - v${__APP_VERSION__}`;
  const dot = (cls = "") => <span className={`absolute h-2.5 w-2.5 rounded-full ring-2 ring-zalo-500 ${TONE_DOT_CLASS[tone]} ${cls}`} />;

  return (
    <>
      {/* Từ lg: cột icon xanh như Zalo PC */}
      <aside className="hidden h-screen w-16 shrink-0 flex-col items-center bg-zalo-500 py-3 dark:bg-[#0b2a5c] lg:flex">
        <NavLink to="/zalo" title={statusText} className="relative mb-3 rounded-full ring-2 ring-white/60">
          <ContactAvatar name={nickName} seed={session?.account?.id ?? "nick"} url={session?.account?.avatarUrl} size="md" />
          {dot("-bottom-0.5 -right-0.5")}
        </NavLink>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              state={navState(item.to)}
              end={item.to === "/"}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) => `${RAIL_BTN} ${isActive ? "bg-white/20 text-white" : ""}`}
            >
              <item.icon size={22} />
              {item.to === "/zalo" && dot("right-2 top-2")}
            </NavLink>
          ))}
        </nav>
        {/* Khóa khẩn cấp đang bật thì mọi tin đều đứng: phải thấy được ở MỌI trang */}
        {killSwitch?.killed && (
          <NavLink to="/settings" title="Khóa khẩn cấp đang BẬT - không tin nào được gửi" className={`${RAIL_BTN} mb-1 bg-red-500 text-white hover:bg-red-600`}>
            <IconWarning size={20} />
          </NavLink>
        )}
        <button
          type="button"
          onClick={toggle}
          title={theme === "dark" ? "Đang tối - bấm để chuyển sáng" : "Đang sáng - bấm để chuyển tối"}
          aria-label="Đổi giao diện sáng/tối"
          className={RAIL_BTN}
        >
          {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
        </button>
        <button type="button" onClick={onLogout} title="Đăng xuất khỏi dashboard" aria-label="Đăng xuất khỏi dashboard" className={RAIL_BTN}>
          <IconLogout size={20} />
        </button>
      </aside>

      {/* Dưới lg: thanh icon ở đáy màn hình */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-line bg-surface lg:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            state={navState(item.to)}
            end={item.to === "/"}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] ${isActive ? "text-zalo-500" : "text-ink-soft"}`
            }
          >
            <item.icon size={20} />
            <span className="truncate">{item.short}</span>
            {item.to === "/zalo" && <span className={`absolute right-[30%] top-2 h-2 w-2 rounded-full ${TONE_DOT_CLASS[tone]}`} />}
            {item.to === "/settings" && killSwitch?.killed && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-red-500" />}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
