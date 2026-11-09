import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardShell } from "./layout/dashboard-shell";
import { LoginPage } from "./pages/login-page";
import { OutboxPage } from "./pages/outbox/outbox-page";
import { OverviewPage } from "./pages/overview/overview-page";
import { SettingsRouteOpener } from "./pages/settings/settings-route-opener";
import { ThreadsPage } from "./pages/threads/threads-page";
import { ZaloAccountRoute } from "./pages/zalo-account/zalo-account-route";

/**
 * Bản đồ trang. Daemon phải trả index.html cho mọi đường dẫn không phải /api
 * (SPA fallback) thì link thẳng `/threads/<id>` mới mở được sau khi tải lại.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <DashboardShell>
              <Routes>
                {/* Vào kho là thấy tin nhắn như Zalo; Tổng quan là một mục ở đáy thanh bên */}
                <Route path="/" element={<Navigate to="/threads" replace />} />
                <Route path="/overview" element={<OverviewPage />} />
                {/* Một route với tham số tùy chọn (không phải hai route): mở/đóng
                    một hội thoại không được dựng lại danh sách bên trái */}
                <Route path="/threads/:threadId?" element={<ThreadsPage />} />
                {/* Tìm kiếm nay nằm ngay trong cột danh sách hội thoại; link cũ /search về đó */}
                <Route path="/search" element={<Navigate to="/threads" replace />} />
                <Route path="/outbox" element={<OutboxPage />} />
                <Route path="/zalo" element={<ZaloAccountRoute />} />
                <Route path="/settings/*" element={<SettingsRouteOpener />} />
                <Route path="*" element={<Navigate to="/threads" replace />} />
              </Routes>
            </DashboardShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
