# Tóm tắt mã nguồn

| Thư mục | Nội dung |
|---|---|
| `src/bin/` | điểm vào: `login-with-qr`, `run-archive-daemon`, `run-mcp-stdio-server`, `outbox-admin`, `replay-raw-journal`, `seed-demo-archive` |
| `src/config/` | `env-schema.ts` (zod, mọi núm chỉnh + mặc định an toàn), `env.ts` (nạp `.env` từ gốc project), `account-paths.ts` |
| `src/archive/` | kiểu dữ liệu chung, nhật ký JSONL thô, `archive-event-ingestor.ts` (đường ghi dùng chung cho live và replay) |
| `src/zalo/` | đăng nhập + credential mã hóa, chuẩn hóa sự kiện zca-js, listener + kế hoạch nối lại, đồng bộ danh bạ, khung offline replay / keepAlive |
| `src/storage/` | mở DB + migration, ghi/đọc tin, FTS, đính kèm, sự kiện kết nối, outbox, cài đặt gửi, kill switch, trạng thái daemon |
| `src/media/` | tải media: kiểm host, giới hạn cỡ, sha256, thử lại |
| `src/mcp/` | MCP server, handler tool đọc + gửi (thuần, test trực tiếp), bọc nội dung không tin cậy |
| `src/outbox/` | nhận yêu cầu gửi (dùng chung MCP/dashboard), cổng gửi (thuần), vòng gửi, CLI |
| `src/daemon/` | quản lý phiên Zalo (QR web, chạy/dừng/đăng xuất) + ghép các khối khi đã đăng nhập |
| `src/dashboard/` | dashboard Hono: hợp đồng API, auth, middleware an ninh, routes |
| `web/` | giao diện React (Vite + Tailwind), build ra `web/dist` |
| `src/shared/` | logger (stderr dễ đọc + file JSON), giao dịch SQLite, bỏ dấu tiếng Việt, ngày giờ theo múi giờ, khóa một tiến trình |
| `patches/` | bản vá zca-js 2.2.0 cho tin 1-1 cmd 551 |

Test: `*.test.ts` cạnh file nguồn, `node:test` + tsx, DB `:memory:`.
