import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconSignal } from "../../shared/dashboard-icons";
import { ZaloAccountPanel } from "./zalo-account-panel";

/**
 * Địa chỉ /zalo. Tài khoản Zalo giờ là một mục của cửa sổ Cài đặt, nhưng LẦN ĐẦU (chưa có nick nào) trang này vẫn là chỗ
 * đăng nhập QR - shell đưa mọi trang về đây cho tới khi có nick. Đã có nick (link cũ, dấu trang): mở cửa sổ Cài đặt ở mục
 * Tài khoản Zalo rồi về Hội thoại. Vừa quét QR xong nick đầu tiên thì chỉ về Hội thoại, không bật cửa sổ.
 */
export function ZaloAccountRoute() {
  const { session, openSettings } = useDashboardShell();
  const hadAccountOnEntry = useRef(session?.account != null);
  const hasAccount = session?.account != null;

  useEffect(() => {
    if (hasAccount && hadAccountOnEntry.current) openSettings("account");
  }, [hasAccount, openSettings]);

  if (!session) return null;
  if (hasAccount) return <Navigate to="/threads" replace />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader icon={IconSignal} title="Tài khoản Zalo" subtitle="Đăng nhập nick Zalo để kho bắt đầu lưu tin" />
      <ZaloAccountPanel />
    </div>
  );
}
