# Tóm tắt mã nguồn

| Thư mục | Nội dung |
|---|---|
| `src/bin/` | điểm vào: `login-with-qr`, `run-archive-daemon`, `run-mcp-stdio-server`, `outbox-admin`, `replay-raw-journal`, `seed-demo-archive` |
| `src/config/` | `env-schema.ts` (zod, mọi núm chỉnh + mặc định an toàn), `env.ts` (nạp `.env` từ gốc project), `account-paths.ts` (thư mục mỗi nick), `app-secrets-store.ts` (khóa tự sinh) |
| `src/accounts/` | `zalo-account-registry.ts` (danh sách nick + nick đang dùng, `data/accounts.json`), `load-or-import-account-registry.ts` (nhận thư mục bản cũ), `active-account-for-cli.ts` |
| `src/archive/` | kiểu dữ liệu chung, nhật ký JSONL thô, `archive-event-ingestor.ts` (đường ghi dùng chung cho live và replay); kiến thức thuần về Zalo: `zalo-emoticon-emoji.ts` (mã biểu cảm / cảm xúc -> emoji, đổi lúc đọc), `zalo-call-message-text.ts` (câu hiển thị của tin cuộc gọi) |
| `src/zalo/` | đăng nhập + credential mã hóa, chuẩn hóa sự kiện zca-js, listener + kế hoạch nối lại, đồng bộ danh bạ, lấy bù tin + cảm xúc lỡ theo mốc (`offline-message-replay.ts`, mốc ở `storage/offline-replay-cursor-store.ts`) / keepAlive; `mobile-sync/` (đồng bộ lịch sử từ điện thoại); `zca-renew-media-link-api.ts` + `renew-link-control-listener.ts` (xin lại link media, nhận link trả sau qua WS) |
| `src/storage/` | mở DB + migration, ghi/đọc tin (`message-row-mapping.ts` dựng dòng tin dùng chung; `message-search-queries.ts` tìm / lọc người gửi, ngày, có file, Nhắc bạn, Biểu cảm; `message-window-queries.ts` trang quanh một tin + tin mới hơn), FTS, đính kèm, sự kiện kết nối, outbox, cài đặt gửi, kill switch, trạng thái daemon |
| `src/media/` | tải media: kiểm host, giới hạn cỡ, sha256, thử lại; ảnh JXL sang PNG; xin lại link hết hạn (`media-link-renewer.ts`, lịch giãn nhịp `media-link-renew-schedule.ts`, dựng / đọc lời gọi `media-link-renewal-request.ts`) |
| `src/mcp/` | MCP server, handler tool đọc + gửi (thuần, test trực tiếp), bọc nội dung không tin cậy, `active-account-tool-context.ts` (theo nick đang dùng) |
| `src/outbox/` | nhận yêu cầu gửi (dùng chung MCP/dashboard), cổng gửi (thuần), vòng gửi, CLI |
| `src/daemon/` | `zalo-account-manager.ts` (nick đang dùng, đổi nick, QR, nhịp đăng nhập), `zalo-session-manager.ts` (phiên một nick), `zalo-qr-login-flow.ts`, `zalo-login-cooldown.ts`, ghép các khối khi đã đăng nhập |
| `src/dashboard/` | dashboard Hono: hợp đồng API, mật khẩu (`dashboard-password-store.ts`, `dashboard-auth.ts`, `login-attempt-limiter.ts`), middleware an ninh, routes (route kho dựng riêng mỗi nick) |
| `web/` | giao diện React (Vite + Tailwind), build ra `web/dist`; trang Hội thoại ở `web/src/pages/threads/` (tìm chung trong cột trái: `thread-search-results.tsx`, `search-start-panel.tsx`; tìm trong một hội thoại: `thread-search-panel.tsx` + `thread-search-filters.tsx`; nhảy tới tin: `use-message-jump.ts`) |
| `src/shared/` | logger (stderr dễ đọc + file JSON), giao dịch SQLite, bỏ dấu tiếng Việt, ngày giờ theo múi giờ, khóa một tiến trình |
| `patches/` | bản vá zca-js 2.2.0 cho tin 1-1 cmd 551 |

Test: `*.test.ts` cạnh file nguồn, `node:test` + tsx, DB `:memory:`.
