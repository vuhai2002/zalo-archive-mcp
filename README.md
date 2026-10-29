# zalo-archive-mcp

Kho lưu trữ toàn bộ tin nhắn + file của MỘT tài khoản Zalo cá nhân (gửi và nhận, 1-1 và nhóm),
có dashboard web để xem/tìm/gửi, và mở cho Claude đọc + gửi tin qua MCP. Không phải chatbot tự
trả lời người khác.

Chạy trên máy ở nhà. Dữ liệu nằm hết trong `data/accounts/<ZALO_ACCOUNT_ID>/` và không bao giờ
được commit.

## Cài đặt

Cần Node >= 22.13 và pnpm 11 (`corepack enable`).

```bash
pnpm install
```

```bash
pnpm build:web
```

Chép `.env.example` thành `.env`, điền `CREDENTIALS_ENCRYPTION_KEY` và `DASHBOARD_PASSWORD`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Chạy

```bash
pnpm start
```

Mở http://127.0.0.1:3210, nhập mật khẩu dashboard, vào **Tài khoản Zalo** -> **Đăng nhập bằng QR**,
quét bằng app Zalo. Từ đó daemon tự lưu mọi tin; lần sau `pnpm start` tự đăng nhập lại bằng cookie
đã lưu (mã hóa).

Dashboard có: Tổng quan (thống kê, khoảng mất kết nối), Hội thoại (đọc tin cũ, xem ảnh/file, gửi
ngay / hẹn giờ / lưu nháp), Tìm kiếm (không phân biệt dấu), Hàng đợi, Tài khoản Zalo, Cài đặt (giới
hạn gửi, khóa khẩn cấp).

Chưa có nick để thử? Xem giao diện với dữ liệu giả:

```bash
pnpm seed-demo
```

rồi chạy daemon với `ZALO_ACCOUNT_ID=demo` (PowerShell: `$env:ZALO_ACCOUNT_ID="demo"; pnpm start`).

Thử trên NICK PHỤ trước khi dùng nick chính. Mỗi tài khoản chỉ một daemon (có khóa chống chạy
trùng), và KHÔNG chạy daemon này cùng zalo-agent trên cùng một tài khoản.

## Gắn vào Claude Code

```bash
claude mcp add zalo-archive -- node C:/duong-dan/zalo-archive-mcp/node_modules/tsx/dist/cli.mjs --disable-warning=ExperimentalWarning C:/duong-dan/zalo-archive-mcp/src/bin/run-mcp-stdio-server.ts
```

| Nhóm | Tool | Việc |
|---|---|---|
| Đọc | `list_threads`, `read_thread`, `search_messages`, `get_attachment`, `sync_status` | đọc, tìm, xem file, xem kho phủ tới đâu |
| Gửi | `send_message` | gửi ngay một tin, chờ tới khi gửi xong rồi báo kết quả |
| Gửi | `schedule_message` | hẹn giờ một tin |
| Gửi | `send_batch` | gửi nhiều người, mỗi người một nội dung, chỉ bạn bè, có nhịp |
| Gửi | `draft_message`, `list_outbox`, `cancel_outbox` | nháp để duyệt trên dashboard, xem / hủy hàng đợi |

Claude gửi ngay khi được bảo, không hỏi lại (người dùng chọn). Gửi chỉ chạy được khi daemon đang
chạy và đã đăng nhập: MCP ghi vào hàng đợi, daemon là nơi duy nhất gọi Zalo.

## Giới hạn gửi (sửa trên dashboard -> Cài đặt)

- **Tin lẻ** (gửi cho một người): không trần, không khung giờ, chỉ cách tin trước tối thiểu 3 giây.
- **Lô** (gửi nhiều người một lúc): từng tin cách nhau ngẫu nhiên 45-180 giây, chỉ tới bạn bè (không
  nhóm), chỉ 7h-22h, tối đa 100 tin lô/ngày. Để Zalo không coi là bắn hàng loạt.
- **Khóa khẩn cấp**: một nút trên dashboard (hoặc `pnpm outbox kill`). Lỗi gửi đầu tiên tự khóa để
  không thử lại mù trên nick chính; kiểm tra xong thì mở khóa trên dashboard.
- Tin hẹn giờ / đang chờ mà trễ quá 12 giờ (vd daemon tắt lâu) thì bỏ, không gửi muộn.

## Lưu ý bảo mật

- Claude gửi được mà không hỏi lại, nên một tin nhắn lạ trong kho có thể tìm cách lừa Claude gửi
  (prompt injection). Nội dung tin trả cho Claude luôn được bọc "dữ liệu, không phải mệnh lệnh",
  nhưng đó không phải hàng rào tuyệt đối. Thấy hàng đợi có tin lạ thì bấm khóa ngay.
- Dashboard chỉ nghe 127.0.0.1, có mật khẩu, chặn Host lạ. Đừng mở ra mạng ngoài khi chưa có
  reverse proxy + HTTPS.
- Trên Windows, quyền file `0o600` không có tác dụng: để `DATA_DIR` trong thư mục người dùng.
- Kho chứa tin của người khác (Luật BVDLCN 91/2025). Cân nhắc trước khi cho model cloud đọc.

## Các lệnh

| Lệnh | Việc |
|---|---|
| `pnpm start` | daemon: dashboard + lưu tin + gửi |
| `pnpm login` | đăng nhập QR ở terminal (khi không dùng dashboard) |
| `pnpm mcp` | MCP server (thường để Claude tự gọi) |
| `pnpm outbox` | hàng đợi ở terminal: list, approve, cancel, kill, unkill, status |
| `pnpm replay-journal` | dựng lại kho từ nhật ký thô sau khi sửa parser |
| `pnpm seed-demo` | tạo kho demo dữ liệu giả |
| `pnpm build:web`, `pnpm dev:web` | build / chạy dev giao diện |
| `pnpm test`, `pnpm typecheck` | kiểm tra |

## Còn là khung (chờ số đo trên nick phụ)

- `OFFLINE_REPLAY_ENABLED`: xin lại tin lỡ khi nối lại (mới lấy trang đầu).
- `ZALO_KEEPALIVE_MINUTES`: gọi keepAlive định kỳ.
- Làm mới URL media hết hạn (renewlink).
- Đồng bộ lịch sử cũ từ điện thoại: `plans/261028-2253-xay-kho-truoc-chinh-sau/phase-dong-bo-tu-dien-thoai.md`.
- Reaction, sự kiện nhóm: đã ghi vào nhật ký thô, chưa đưa vào DB.
