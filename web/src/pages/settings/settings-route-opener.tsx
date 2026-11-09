import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useDashboardShell, type SettingsSection } from "../../layout/dashboard-shell-context";

/** Địa chỉ cũ /settings/... (dấu trang, link cũ): mở cửa sổ Cài đặt đúng mục rồi về trang Hội thoại - Cài đặt giờ là cửa sổ nổi */
export function SettingsRouteOpener() {
  const { openSettings } = useDashboardShell();
  const path = useLocation().pathname;
  const section: SettingsSection = path.startsWith("/settings/kill-switch") ? "kill-switch" : path.startsWith("/settings/data") ? "data" : "send";
  useEffect(() => openSettings(section), [openSettings, section]);
  return <Navigate to="/threads" replace />;
}
