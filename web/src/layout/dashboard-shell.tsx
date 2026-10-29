import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MeResponse } from "../archive-api-types";
import { api, ApiError, errorText, loginPath } from "../dashboard-api-client";
import { anhNen } from "../shared/background-image";
import { IconArchive, IconMenu } from "../shared/dashboard-icons";
import { ErrorNote, LoadingText } from "../shared/ui-bits";
import { useTheme } from "../shared/use-theme";
import { DashboardShellContext, type DashboardShellValue } from "./dashboard-shell-context";
import { SidebarNav } from "./sidebar-nav";
import { useShellStatusPolling } from "./use-shell-status-polling";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme } = useTheme();
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
    () => (me ? { me, session, killSwitch, applySession, applyKillSwitch } : null),
    [me, session, killSwitch, applySession, applyKillSwitch],
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
      <div className="flex min-h-[100dvh] bg-canvas">
        <SidebarNav
          session={session}
          killSwitch={killSwitch}
          onLogout={logout}
          mobileOpen={menuOpen}
          onCloseMobile={() => setMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-hidden">
          {/* Topbar chỉ ở mobile - desktop đã có sidebar cố định */}
          <header className="sticky top-0 z-30 flex h-[53px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Mở menu"
              className="rounded-lg p-1.5 text-ink-soft hover:bg-tile hover:text-ink"
            >
              <IconMenu size={20} />
            </button>
            <Link to="/" className="flex items-center gap-2" title="Về trang chính">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zalo-500 text-white">
                <IconArchive size={16} />
              </span>
              <span className="truncate text-[15px] font-semibold text-ink">Kho Zalo</span>
            </Link>
          </header>

          {/* Ảnh nền phủ vùng nội dung, không phủ sidebar. `bg-canvas` làm màu lót
              khi ảnh chưa tải xong để trang không nháy trắng. */}
          <main
            className="min-w-0 flex-1 bg-canvas bg-cover bg-fixed bg-center px-4 py-5 sm:px-6 lg:overflow-y-auto lg:px-8 lg:py-7"
            style={{ backgroundImage: `url(${anhNen(theme)})` }}
          >
            {children}
          </main>
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
