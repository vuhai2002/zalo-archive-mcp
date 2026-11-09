import { createContext, useContext } from "react";
import type { MeResponse, SessionStatus, SettingsResponse } from "../archive-api-types";

export type KillSwitchState = SettingsResponse["killSwitch"];
/** Mục của cửa sổ Cài đặt (menu trái), như Zalo PC */
export type SettingsSection = "account" | "send" | "kill-switch" | "sync" | "data" | "appearance";

/**
 * Trạng thái dùng chung sau đăng nhập: múi giờ kho, phiên Zalo, khóa khẩn cấp.
 * Sidebar và các trang cùng đọc MỘT nguồn - bấm "Dừng" ở trang Tài khoản là
 * chấm trạng thái ở sidebar đổi theo ngay, không đợi lượt hỏi 15 giây kế tiếp.
 */
export type DashboardShellValue = {
  me: MeResponse;
  session: SessionStatus | null;
  /** null khi chưa tải được lần nào */
  killSwitch: KillSwitchState | null;
  /** Ghi kết quả một thao tác phiên (POST trả SessionStatus) và hỏi dồn vài giây sau đó */
  applySession: (s: SessionStatus) => void;
  applyKillSwitch: (k: KillSwitchState) => void;
  /** Mở cửa sổ Cài đặt đè lên trang đang xem (không đổi trang), tại một mục */
  openSettings: (section?: SettingsSection) => void;
};

export const DashboardShellContext = createContext<DashboardShellValue | null>(null);

export function useDashboardShell(): DashboardShellValue {
  const value = useContext(DashboardShellContext);
  if (!value) throw new Error("useDashboardShell phải dùng bên trong DashboardShell");
  return value;
}

/** Múi giờ của kho - mọi chỗ hiển thị giờ đều đi qua đây */
export function useArchiveTimeZone(): string {
  return useDashboardShell().me.timeZone;
}
