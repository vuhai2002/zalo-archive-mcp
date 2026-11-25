import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AppUpdateDialog, IconArrowUpCircle, useAppUpdateInfo } from "./app-update-dialog";
import type { SessionStatus } from "../archive-api-types";
import { ContactAvatar } from "../shared/contact-avatar";
import { IconChat, IconGear, IconGrid, IconInbox, IconPresentation, IconWarning, type IconFn } from "../shared/dashboard-icons";
import { sessionShortText, sessionTone, TONE_DOT_CLASS } from "../shared/session-state-labels";
import { useDashboardShell, type KillSwitchState } from "./dashboard-shell-context";
import { usePresentationMode } from "./presentation-mode-context";
import { SidebarSettingsMenu } from "./sidebar-settings-menu";
import { IconZaloChat } from "../shared/zalo-style-icons";

/**
 * Thanh icon kiểu Zalo PC: cột xanh hẹp sát mép trái (từ lg). Trên cùng avatar nick đang dùng (bấm mở Cài đặt > Tài khoản
 * Zalo, chấm màu = trạng thái nghe tin), rồi Hội thoại, Hàng đợi gửi. Dưới cùng: Tổng quan ngay trên nút bánh răng (menu
 * Thông tin tài khoản, Cài đặt, Dữ liệu, Giao diện, Đăng xuất) như Zalo PC. Dưới lg: thanh icon ở đáy màn hình, kèm nhãn nhỏ.
 *
 * Nút Trình chiếu (dưới Hàng đợi): mở hộp chọn hội thoại; đang trình chiếu thì nút đỏ, bấm là hỏi lại rồi mới thoát. Lúc trình chiếu ẩn Hàng
 * đợi và Tổng quan (lộ tin gửi tới người khác, hội thoại nhiều tin nhất) để lỡ tay bấm cũng không lộ lên màn hình chia sẻ.
 */

type NavItem = { to: string; label: string; short: string; icon: IconFn };
const TOP_ITEMS: NavItem[] = [
  { to: "/threads", label: "Hội thoại", short: "Tin nhắn", icon: IconChat },
  { to: "/outbox", label: "Hàng đợi gửi", short: "Hàng đợi", icon: IconInbox },
];
const OVERVIEW: NavItem = { to: "/overview", label: "Tổng quan", short: "Tổng quan", icon: IconGrid };

/** Bấm icon Hội thoại (kể cả khi đang ở đó): đóng hội thoại đang mở, về danh sách đầu trang, thoát chế độ tìm - như Zalo */
const navState = (to: string) => (to === "/threads" ? { resetThreadList: true } : undefined);

// Như Zalo PC: ô 48px bo góc, biểu tượng trắng; rê chuột tối nhẹ, đang chọn tối hẳn (đen 25% chồng lên nền xanh)
const RAIL_BTN = "relative flex h-12 w-12 items-center justify-center rounded-lg text-white transition-colors hover:bg-black/10";

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      state={navState(item.to)}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) => `${RAIL_BTN} ${isActive ? "bg-black/25 hover:bg-black/25" : ""}`}
    >
      {({ isActive }) =>
        item.to === "/threads" ? <IconZaloChat size={28} strokeWidth={1.9} active={isActive} /> : <item.icon size={26} strokeWidth={1.9} />
      }
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

function PresentationRailButton() {
  const p = usePresentationMode();
  const title = p.active ? "Đang trình chiếu - bấm để thoát" : "Chế độ trình chiếu: chỉ hiện vài hội thoại khi chia sẻ màn hình";
  return (
    <button
      type="button"
      onClick={p.active ? p.requestStop : p.openSetup}
      title={title}
      aria-label={title}
      aria-pressed={p.active}
      className={`${RAIL_BTN} ${p.active ? "bg-red-500 hover:bg-red-600" : ""}`}
    >
      <IconPresentation size={26} strokeWidth={1.9} />
    </button>
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
  const presenting = usePresentationMode().active;
  const topItems = presenting ? TOP_ITEMS.slice(0, 1) : TOP_ITEMS;
  const tone = sessionTone(session);
  const nickName = session?.account?.displayName ?? session?.displayName ?? session?.account?.id ?? "Chưa có nick";
  const statusText = `${nickName} - ${sessionShortText(session)} - v${__APP_VERSION__}`;
  const update = useAppUpdateInfo();
  const [showUpdate, setShowUpdate] = useState(false);
  const updateTitle = update ? `Có bản mới v${update.latest} - bấm để xem cách cập nhật` : "";

  return (
    <>
      {/* Từ lg: cột icon xanh như Zalo PC */}
      <aside className="hidden h-screen w-16 shrink-0 flex-col items-center bg-[#005ae0] py-3 dark:bg-[#0b2a5c] lg:flex">
        <button type="button" onClick={() => openSettings("account")} title={statusText} aria-label={`Tài khoản Zalo: ${statusText}`} className="relative mb-3 rounded-full ring-2 ring-white/60">
          <ContactAvatar name={nickName} seed={session?.account?.id ?? "nick"} url={session?.account?.avatarUrl} size="md" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-zalo-500 ${TONE_DOT_CLASS[tone]}`} />
        </button>
        <nav className="flex flex-1 flex-col items-center gap-2">
          {topItems.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
          <PresentationRailButton />
        </nav>
        {/* Khóa khẩn cấp đang bật thì mọi tin đều đứng: phải thấy được ở MỌI trang */}
        {killSwitch?.killed && (
          <button type="button" onClick={() => openSettings("kill-switch")} title="Khóa khẩn cấp đang BẬT - không tin nào được gửi" className={`${RAIL_BTN} mb-1 bg-red-500 text-white hover:bg-red-600`}>
            <IconWarning size={20} />
          </button>
        )}
        {update && !presenting && (
          <button type="button" onClick={() => setShowUpdate(true)} title={updateTitle} aria-label={updateTitle} className={`${RAIL_BTN} mb-1`}>
            <IconArrowUpCircle size={26} strokeWidth={1.9} />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#005ae0] dark:ring-[#0b2a5c]" />
          </button>
        )}
        {!presenting && (
          <div className="mb-1">
            <RailLink item={OVERVIEW} />
          </div>
        )}
        <SidebarSettingsMenu variant="rail" onLogout={onLogout}>
          <IconGear size={26} strokeWidth={1.9} />
        </SidebarSettingsMenu>
      </aside>

      {/* Dưới lg: thanh icon ở đáy màn hình, cùng thứ tự với cột icon */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-line bg-surface lg:hidden">
        {(presenting ? topItems : [...TOP_ITEMS, OVERVIEW]).map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
        {update && !presenting && (
          <button type="button" onClick={() => setShowUpdate(true)} aria-label={updateTitle} className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] text-emerald-600">
            <IconArrowUpCircle size={20} />
            <span className="truncate">Bản mới</span>
          </button>
        )}
        <SidebarSettingsMenu variant="tab" onLogout={onLogout}>
          <IconGear size={20} />
          <span className="truncate">Cài đặt</span>
          {/* Màn hẹp không có avatar: chấm trạng thái nghe tin nằm ở đây; khóa khẩn cấp bật thì chấm đỏ */}
          <span className={`absolute right-[30%] top-2 h-2 w-2 rounded-full ${killSwitch?.killed ? "bg-red-500" : TONE_DOT_CLASS[tone]}`} />
        </SidebarSettingsMenu>
      </nav>
      {showUpdate && update && <AppUpdateDialog info={update} onClose={() => setShowUpdate(false)} />}
    </>
  );
}
