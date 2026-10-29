import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Version lấy từ package.json gốc, không gõ tay trong JSX: nâng package.json mà
 * web vẫn hiện số cũ thì người dùng tưởng đang chạy bản đó. Đọc bằng
 * readFileSync thay vì import JSON để khỏi kéo cả file vào bundle.
 */
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Proxy dev trỏ đúng cổng daemon đang nghe: đọc DASHBOARD_HOST/PORT từ cùng file
 * `.env` gốc mà daemon đọc, đổi cổng một chỗ là cả hai theo. Host "nghe mọi
 * card mạng" (0.0.0.0, ::) không dùng làm đích kết nối được nên quy về loopback.
 */
function proxyTarget(mode: string): string {
  const env = loadEnv(mode, repoRoot, "DASHBOARD_");
  const host = env.DASHBOARD_HOST;
  const safeHost = !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${safeHost}:${env.DASHBOARD_PORT || "3210"}`;
}

// Root là thư mục web/ (`vite web`); build ra web/dist để daemon serve.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    proxy: {
      // changeOrigin: daemon chặn Host lạ, mà Host gốc của dev server là localhost:5173
      "/api": { target: proxyTarget(mode), changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
