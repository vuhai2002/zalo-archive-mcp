import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SettingsSection } from "../../layout/dashboard-shell-context";
import { IconDatabase, IconLock, IconRefresh, IconSend } from "../../shared/action-and-media-icons";
import { useChotNen } from "../../shared/backdrop-close-guard";
import { IconClose, IconSun, IconUsers, type IconFn } from "../../shared/dashboard-icons";
import { IconInfoCircle } from "../../layout/app-update-icons";
import { useAppUpdateState } from "../../layout/app-update-store";
import { AboutSection } from "./settings-about-section";
import { AccountSection, SyncSection } from "./settings-account-sections";
import { AppearanceSection } from "./settings-appearance-section";
import { KillSwitchSection, SendSection } from "./settings-send-sections";
import { SettingsViewContext, type SettingsView, type SettingsViewValue } from "./settings-view-context";
import { StorageFileGridSection } from "./storage/storage-file-grid-section";
import { StorageOverviewSection } from "./storage/storage-overview-section";
import { StorageThreadListSection } from "./storage/storage-thread-list-section";

// Thứ tự theo Zalo PC: tài khoản trước, rồi các mục cài đặt, Đồng bộ trước Quản lý dữ liệu, Giao diện cuối
const MENU: Array<{ section: SettingsSection; label: string; icon: IconFn }> = [
  { section: "account", label: "Tài khoản Zalo", icon: IconUsers },
  { section: "send", label: "Gửi tin và giới hạn", icon: IconSend },
  { section: "kill-switch", label: "Khóa khẩn cấp", icon: IconLock },
  { section: "sync", label: "Đồng bộ và sao lưu", icon: IconRefresh },
  { section: "data", label: "Quản lý dữ liệu", icon: IconDatabase },
  { section: "appearance", label: "Giao diện", icon: IconSun },
  { section: "about", label: "Giới thiệu", icon: IconInfoCircle },
];

/**
 * Cửa sổ Cài đặt như Zalo PC: mở đè lên trang đang xem (không đổi trang), menu trái, nội dung phải, nút X; Esc hoặc bấm ra nền
 * để đóng. Màn hẹp thì chiếm cả màn hình, menu thành hàng tab. Hộp xác nhận / cửa sổ xem file mở bên trong thì Esc đóng chúng trước.
 */
export function SettingsModal({ initial, onClose }: { initial: SettingsSection; onClose: () => void }) {
  const navigate = useNavigate();
  const [view, setView] = useState<SettingsView>({ section: initial });
  const nen = useChotNen(onClose);
  const hasUpdate = useAppUpdateState()?.updateAvailable ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hộp con (xác nhận xóa, xem file) đang mở thì Esc là của nó
      if (e.key === "Escape" && document.querySelectorAll('[aria-modal="true"]').length <= 1) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openInMain = useCallback(
    (path: string) => {
      onClose();
      navigate(path);
    },
    [navigate, onClose],
  );
  const ctx = useMemo<SettingsViewValue>(() => ({ view, go: setView, close: onClose, openInMain }), [view, onClose, openInMain]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 sm:p-4" {...nen} role="dialog" aria-modal="true" aria-label="Cài đặt">
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-2xl sm:h-[min(88dvh,880px)] sm:max-w-[1120px] sm:rounded-2xl lg:flex-row">
        <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line p-2 lg:w-72 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:p-3">
          <h1 className="hidden px-3 pb-4 pt-2 text-[22px] font-semibold text-ink lg:block">Cài đặt</h1>
          {MENU.map((m) => {
            const active = view.section === m.section;
            return (
              <button
                key={m.section}
                type="button"
                onClick={() => setView({ section: m.section })}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] ${active ? "bg-zalo-50 font-medium text-zalo-600 dark:bg-zalo-500/15 dark:text-zalo-500" : "text-ink hover:bg-tile"}`}
              >
                <m.icon size={20} />
                {m.label}
                {m.section === "about" && hasUpdate && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" aria-label="Có bản mới" />}
              </button>
            );
          })}
          <button type="button" onClick={onClose} aria-label="Đóng cài đặt" className="ml-auto shrink-0 rounded-full p-2 text-ink-soft hover:bg-tile lg:hidden">
            <IconClose size={22} />
          </button>
        </nav>
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-chat/40 p-4 lg:px-8 lg:py-6">
          <button type="button" onClick={onClose} aria-label="Đóng cài đặt" className="absolute right-4 top-4 z-10 hidden rounded-full p-2 text-ink-soft hover:bg-tile hover:text-ink lg:block">
            <IconClose size={24} />
          </button>
          <SettingsViewContext.Provider value={ctx}>
            <SectionBody key={`${view.section}:${view.page ?? ""}:${view.thread ?? ""}:${view.big ? 1 : 0}`} view={view} />
          </SettingsViewContext.Provider>
        </div>
      </div>
    </div>
  );
}

function SectionBody({ view }: { view: SettingsView }) {
  if (view.section === "account") return <AccountSection />;
  if (view.section === "sync") return <SyncSection />;
  if (view.section === "send") return <SendSection />;
  if (view.section === "kill-switch") return <KillSwitchSection />;
  if (view.section === "appearance") return <AppearanceSection />;
  if (view.section === "about") return <AboutSection />;
  if (view.page === "threads") return <StorageThreadListSection />;
  if (view.page === "files") return <StorageFileGridSection />;
  return <StorageOverviewSection />;
}
