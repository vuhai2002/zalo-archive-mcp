import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import type { MeResponse, SessionStatus } from "../archive-api-types";
import { api, ApiError, errorText, loginPath } from "../dashboard-api-client";
import { ErrorNote, LoadingText } from "../shared/ui-bits";
import { SettingsModal } from "../pages/settings/settings-modal";
import { DashboardShellContext, type DashboardShellValue, type SettingsSection } from "./dashboard-shell-context";
import { SidebarNav } from "./sidebar-nav";
import { useShellStatusPolling } from "./use-shell-status-polling";

/**
 * Nội dung các trang theo NICK ĐANG DÙNG:
 * - chưa có nick nào thì đưa thẳng tới trang Tài khoản Zalo để quét QR (đã có nick thì Tài khoản là mục của cửa sổ Cài đặt);
 * - đổi nick thì dựng lại trang (key theo nick) để không còn dữ liệu nick cũ trên màn hình.
 */
function AccountGate({ session, children }: { session: SessionStatus | null; children: ReactNode }) {
  const location = useLocation();
  if (!session) return <LoadingText />;
  if (!session.account && location.pathname !== "/zalo") return <Navigate to="/zalo" replace />;
  return <Fragment key={session.account?.id ?? "no-account"}>{children}</Fragment>;
}

/**
 * Khung sau đăng nhập + cổng xác thực: hỏi `/api/auth/me` một lần lúc vào;
 * 401 thì về trang đăng nhập (kèm `next` để quay lại đúng trang đang mở, vd
 * link thẳng tới một hội thoại). Lỗi khác (daemon tắt) thì hiện lỗi + thử lại
 * chứ KHÔNG đá về trang đăng nhập - nhập mật khẩu cũng không cứu được.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  // Cửa sổ Cài đặt mở đè lên trang đang xem (như Zalo PC); null = đóng
  const [settingsAt, setSettingsAt] = useState<SettingsSection | null>(null);
  const openSettings = useCallback((section: SettingsSection = "send") => setSettingsAt(section), []);
  const closeSettings = useCallback(() => setSettingsAt(null), []);
  const fullBleed = useLocation().pathname.startsWith("/threads");
  const { session, killSwitch, applySession, applyKillSwitch } = useShellStatusPolling(me !== null);

  const checkAuth = useCallback(() => {
    setGateError(null);
    api
      .me()
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          navigate(loginPath(window.location.pathname + window.location.search), { replace: true });
        } else {
          setGateError(errorText(err));
        }
      });
  }, [navigate]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    navigate("/login", { replace: true });
  }, [navigate]);

  const ctx = useMemo<DashboardShellValue | null>(
    () => (me ? { me, session, killSwitch, applySession, applyKillSwitch, openSettings } : null),
    [me, session, killSwitch, applySession, applyKillSwitch, openSettings],
  );

  if (!ctx) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md">
          {gateError ? <ErrorNote message={gateError} onRetry={checkAuth} /> : <LoadingText />}
        </div>
      </div>
    );
  }

  return (
    <DashboardShellContext.Provider value={ctx}>
      <div className="flex min-h-[100dvh] bg-canvas pb-14 lg:pb-0">
        <SidebarNav session={session} killSwitch={killSwitch} onLogout={logout} />

        <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-hidden">
          {/* Topbar chỉ ở mobile - desktop đã có cột icon cố định */}
          <header className="sticky top-0 z-30 flex h-[53px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
            <Link to="/threads" className="flex min-w-0 flex-1 items-center gap-2" title="Về trang tin nhắn">
              <img src="/app-logo.png" alt="" className="h-7 w-7 shrink-0" />
              <span className="truncate text-[15px] font-semibold text-ink">Kho Zalo</span>
            </Link>
          </header>

          {/* Trang Hội thoại chiếm sát mép như Zalo PC; trang khác nền trơn + khoảng đệm */}
          <main
            className={
              fullBleed
                ? "min-w-0 flex-1 bg-surface lg:overflow-hidden"
                : "min-w-0 flex-1 bg-canvas px-4 py-5 sm:px-6 lg:overflow-y-auto lg:px-8 lg:py-7 lg:scrollbar-stable"
            }
          >
            <AccountGate session={session}>{children}</AccountGate>
          </main>
          {settingsAt && <SettingsModal initial={settingsAt} onClose={closeSettings} />}
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
