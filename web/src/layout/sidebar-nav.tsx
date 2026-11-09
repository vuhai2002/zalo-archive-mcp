import { NavLink } from "react-router-dom";
import type { SessionStatus } from "../archive-api-types";
import { ContactAvatar } from "../shared/contact-avatar";
import { IconChat, IconGear, IconGrid, IconInbox, IconWarning, type IconFn } from "../shared/dashboard-icons";
import { sessionShortText, sessionTone, TONE_DOT_CLASS } from "../shared/session-state-labels";
import { useDashboardShell, type KillSwitchState } from "./dashboard-shell-context";
import { SidebarSettingsMenu } from "./sidebar-settings-menu";

/**
 * Thanh icon kiểu Zalo PC: cột xanh hẹp sát mép trái (từ lg). Trên cùng avatar nick đang dùng (bấm mở Cài đặt > Tài khoản
 * Zalo, chấm màu = trạng thái nghe tin), rồi Hội thoại, Hàng đợi gửi. Dưới cùng: Tổng quan ngay trên nút bánh răng (menu
 * Thông tin tài khoản, Cài đặt, Dữ liệu, Giao diện, Đăng xuất) như Zalo PC. Dưới lg: thanh icon ở đáy màn hình, kèm nhãn nhỏ.
 */

type NavItem = { to: string; label: string; short: string; icon: IconFn };
const TOP_ITEMS: NavItem[] = [
  { to: "/threads", label: "Hội thoại", short: "Tin nhắn", icon: IconChat },
  { to: "/outbox", label: "Hàng đợi gửi", short: "Hàng đợi", icon: IconInbox },
];
const OVERVIEW: NavItem = { to: "/overview", label: "Tổng quan", short: "Tổng quan", icon: IconGrid };

/** Bấm icon Hội thoại (kể cả khi đang ở đó): đóng hội thoại đang mở, về danh sách đầu trang, thoát chế độ tìm - như Zalo */
const navState = (to: string) => (to === "/threads" ? { resetThreadList: true } : undefined);

const RAIL_BTN = "relative flex h-12 w-12 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white";

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      state={navState(item.to)}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) => `${RAIL_BTN} ${isActive ? "bg-white/20 text-white" : ""}`}
    >
      <item.icon size={22} />
    </NavLink>
  );
}

function TabLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      state={navState(item.to)}
      className={({ isActive }) => `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] ${isActive ? "text-zalo-500" : "text-ink-soft"}`}
    >
      <item.icon size={20} />
      <span className="truncate">{item.short}</span>
    </NavLink>
  );
}

export function SidebarNav({
  session,
  killSwitch,
  onLogout,
}: {
  session: SessionStatus | null;
  killSwitch: KillSwitchState | null;
  onLogout: () => void;
}) {
  const { openSettings } = useDashboardShell();
  const tone = sessionTone(session);
  const nickName = session?.account?.displayName ?? session?.displayName ?? session?.account?.id ?? "Chưa có nick";
  const statusText = `${nickName} - ${sessionShortText(session)} - v${__APP_VERSION__}`;

  return (
    <>
      {/* Từ lg: cột icon xanh như Zalo PC */}
      <aside className="hidden h-screen w-16 shrink-0 flex-col items-center bg-zalo-500 py-3 dark:bg-[#0b2a5c] lg:flex">
        <button type="button" onClick={() => openSettings("account")} title={statusText} aria-label={`Tài khoản Zalo: ${statusText}`} className="relative mb-3 rounded-full ring-2 ring-white/60">
          <ContactAvatar name={nickName} seed={session?.account?.id ?? "nick"} url={session?.account?.avatarUrl} size="md" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-zalo-500 ${TONE_DOT_CLASS[tone]}`} />
        </button>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {TOP_ITEMS.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>
        {/* Khóa khẩn cấp đang bật thì mọi tin đều đứng: phải thấy được ở MỌI trang */}
        {killSwitch?.killed && (
          <button type="button" onClick={() => openSettings("kill-switch")} title="Khóa khẩn cấp đang BẬT - không tin nào được gửi" className={`${RAIL_BTN} mb-1 bg-red-500 text-white hover:bg-red-600`}>
            <IconWarning size={20} />
          </button>
        )}
        <div className="mb-1">
          <RailLink item={OVERVIEW} />
        </div>
        <SidebarSettingsMenu variant="rail" onLogout={onLogout}>
          <IconGear size={22} />
        </SidebarSettingsMenu>
      </aside>

      {/* Dưới lg: thanh icon ở đáy màn hình, cùng thứ tự với cột icon */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-line bg-surface lg:hidden">
        {[...TOP_ITEMS, OVERVIEW].map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
        <SidebarSettingsMenu variant="tab" onLogout={onLogout}>
          <IconGear size={20} />
          <span className="truncate">Cài đặt</span>
          {/* Màn hẹp không có avatar: chấm trạng thái nghe tin nằm ở đây; khóa khẩn cấp bật thì chấm đỏ */}
          <span className={`absolute right-[30%] top-2 h-2 w-2 rounded-full ${killSwitch?.killed ? "bg-red-500" : TONE_DOT_CLASS[tone]}`} />
        </SidebarSettingsMenu>
      </nav>
    </>
  );
}
