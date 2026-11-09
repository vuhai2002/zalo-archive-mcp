import { createContext, useContext } from "react";
import type { SettingsSection } from "../../layout/dashboard-shell-context";

/**
 * Điều hướng BÊN TRONG cửa sổ Cài đặt (không đổi địa chỉ trang, như Zalo PC): mục ở menu trái, và trong Quản lý dữ liệu là
 * màn con (danh sách hội thoại, lưới file của một hội thoại / file lớn).
 */
export type SettingsView = {
  section: SettingsSection;
  page?: "threads" | "files";
  /** Lưới file của một hội thoại (`thread`), hoặc file lớn hơn 5 MB của cả kho (`big`) */
  thread?: string;
  threadName?: string | null;
  big?: boolean;
};

export type SettingsViewValue = {
  view: SettingsView;
  go: (v: SettingsView) => void;
  close: () => void;
  /** Đóng cửa sổ rồi mở một trang của dashboard (vd Xem tin gốc trong hội thoại) */
  openInMain: (path: string) => void;
};

export const SettingsViewContext = createContext<SettingsViewValue | null>(null);

export function useSettingsView(): SettingsViewValue {
  const v = useContext(SettingsViewContext);
  if (!v) throw new Error("useSettingsView phải dùng bên trong cửa sổ Cài đặt");
  return v;
}
