import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardShell } from "./layout/dashboard-shell";
import { LoginPage } from "./pages/login-page";
import { OutboxPage } from "./pages/outbox/outbox-page";
import { OverviewPage } from "./pages/overview/overview-page";
import { SearchPage } from "./pages/search/search-page";
import { SettingsPage } from "./pages/settings/settings-page";
import { ThreadsPage } from "./pages/threads/threads-page";
import { ZaloAccountPage } from "./pages/zalo-account/zalo-account-page";

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
                <Route path="/" element={<OverviewPage />} />
                {/* Một route với tham số tùy chọn (không phải hai route): mở/đóng
                    một hội thoại không được dựng lại danh sách bên trái */}
                <Route path="/threads/:threadId?" element={<ThreadsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/outbox" element={<OutboxPage />} />
                <Route path="/zalo" element={<ZaloAccountPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </DashboardShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
