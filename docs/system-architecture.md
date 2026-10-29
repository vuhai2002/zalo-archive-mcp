# Kiến trúc hệ thống

Ba tiến trình trên máy nhà, chung một file SQLite (WAL) mỗi nick. Mỗi lúc chỉ MỘT nick chạy (nick đang
dùng ghi ở `data/accounts.json`); daemon, MCP và lệnh CLI đều theo nick đó:

```
 điện thoại / Zalo PC / người khác
              |
        máy chủ Zalo (WebSocket)
              |
   +---------------------+        +--------------------+
   | daemon (pnpm start) |        | MCP server (stdio) | <--- Claude
   | listener zca-js     |        | đọc + gửi (qua     |
   | tải media           |        | hàng đợi)          |
   |                     |        +---------+----------+
   | đồng bộ danh bạ     |                  |
   | vòng gửi + dashboard|                  |
   +----------+----------+                  |
              |      data/accounts/<id>/    |
              +------> archive.db <---------+
              |        raw-events/*.jsonl
              |        media/<sha>/...
              |
   dashboard web / CLI (pnpm outbox) ---> gửi, duyệt, cài đặt, kill switch
```

## Luồng ghi tin

1. zca-js phát sự kiện (`message`, `undo`, `old_messages`; `selfListen: true` để có cả tin tự gửi).
2. `archive-listener.ts` ghi NGUYÊN VĂN vào `raw-events/<ngày>.jsonl`.
3. `archive-event-ingestor.ts` chuẩn hóa (`normalize-zalo-event.ts`) rồi `upsertMessage`:
   khử trùng theo `msg_id`, cập nhật FTS (chữ đã bỏ dấu), thêm đính kèm `pending`, áp lệnh thu
   hồi tới trước, cập nhật hội thoại.
4. `media-download-worker.ts` tải từng đính kèm (chỉ host CDN Zalo, kiểm mỗi bước redirect),
   lưu theo sha256.
5. Link hết hạn (403/404/410, hoặc CDN trả 200 kèm trang báo hết hạn): `media-link-renewer.ts`
   xin Zalo cấp lại link qua `renewlink` (cmd 12094, tham số như bước chuyển tiếp của Zalo Web:
   file 1 / ảnh 2 / video 5). Zalo thường trả `{async: true}` rồi gửi link qua sự kiện điều khiển
   WS cmd 601 `act = "renew_link"` - `renew-link-control-listener.ts` đọc thẳng khung WS (zca-js bỏ
   qua sự kiện này), ghép theo link gốc, chờ tối đa 30 giây. Mỗi file một lần tự động; các lệnh
   cách nhau ngẫu nhiên 4-10 giây, trần 200/ngày (lượt cấp lúc xếp hàng, quá trần sang ngày sau).
   Dashboard có nút "Thử lại" trên file hỏng.

Parser sai: sửa code, `pnpm replay-journal` dựng lại (giữ `source`/`received_at` của lần đầu).

## Luồng gửi

```
MCP send_message / dashboard "Gửi ngay" / CLI  -> outbox (approved, mode single|batch)
   -> daemon OutboxSender (2 giây kiểm một lần) -> send-policy.ts -> sending -> sent | failed
draft_message / dashboard "Lưu nháp" -> outbox (draft) --(Duyệt trên dashboard)--> approved
```

Nick **Chỉ đọc** (cờ `readOnly` trong `data/accounts.json`; nick mới thêm mặc định bật, nick có
từ trước giữ như cũ, cờ sai kiểu coi là bật) bị chặn ở cả ba lớp: xếp tin (`enqueueSingle` /
`enqueueBatch` bắt buộc khai báo `readOnly`, dùng chung cho MCP và dashboard; dashboard còn chặn
duyệt nháp), MCP đọc lại cờ theo nick đang dùng mỗi lần gọi tool, và `OutboxSender` không đụng hàng
đợi (không gửi, không "đang soạn") - kiểm cả lúc lấy tin lẫn ngay trước khi gọi Zalo.

Cổng kiểm LÚC GỬI và kiểm lại ngay trước khi gọi Zalo:
- tin lẻ: kill switch + cách tin trước tối thiểu vài giây;
- lô: thêm chỉ bạn bè, nhịp ngẫu nhiên, khung giờ, trần ngày (tin lô phải chờ thì dời riêng nó).

Lỗi gửi đầu tiên bật kill switch. Mục `sending` bỏ dở thành `failed`, không tự gửi lại.
Cài đặt gửi: mặc định `.env`, sửa trên dashboard lưu `meta.send_settings`.

## Dashboard

Chạy trong tiến trình daemon (`src/dashboard`), phục vụ `web/dist`. Hợp đồng API:
`src/dashboard/dashboard-api-contract.ts` + `dashboard-auth-and-account-contract.ts`.

- Mật khẩu: tạo trên dashboard lần đầu (`/api/auth/setup`, chỉ khi chưa có), lưu băm scrypt ở
  `data/dashboard-password.json`; cookie phiên ký HMAC bằng khóa trong `data/app-secrets.json` + bản
  băm (đặt lại mật khẩu là phiên cũ chết). Sai 5 lần / 10 phút thì khóa đăng nhập 1 phút.
- Nick: `ZaloAccountManager` giữ danh sách nick, nick đang dùng, luồng QR (`ZaloQrLoginFlow`) và nhịp
  đăng nhập (`ZaloLoginCooldown`, mặc định 30 giây giữa hai lần đăng nhập). QR luôn dừng nick đang
  chạy trước; quét xong mới biết uid -> uid đã có thì nối tiếp thư mục cũ, chưa có thì thêm nick
  (id = uid). Mỗi nick một `ZaloSessionManager` (cookie, chạy/dừng/đăng xuất), trạng thái ghi
  `meta.daemon_session_state` trong DB nick đó để MCP biết daemon gửi được không.
- Route kho / gửi / cài đặt / media dựng riêng cho từng nick (một lần), mỗi yêu cầu đi vào bộ route
  của nick đang dùng; chưa có nick thì 409.

Khóa mã hóa cookie tự sinh (`data/app-secrets.json`); máy chạy bản cũ thì lấy
`CREDENTIALS_ENCRYPTION_KEY` trong `.env` một lần. Danh sách nick dựng từ các thư mục
`data/accounts/*` có sẵn nếu chưa có `accounts.json`.

## Lấy bù tin lỡ

Mỗi lần listener kết nối: xin Zalo gửi bù tin 1-1 (cmd 510), 2-5 giây sau tin nhóm (511). Nối lại
trong vòng `OFFLINE_REPLAY_MIN_INTERVAL_MINUTES` thì không xin lại. Tin trả về khử trùng theo msg_id.
Mới lấy trang đầu (giới hạn zca-js 2.2.0); Zalo giữ khoảng 2 tuần.

## Bảng chính (`src/storage/archive-schema-migrations.ts`)

`messages` (UNIQUE msg_id, cột `source`), `messages_fts`, `message_recalls`, `attachments`,
`threads`, `connection_events` (tính khoảng listener không nghe), `outbox` (mode single/batch),
`send_control` (kill switch), `meta` (cài đặt gửi, trạng thái daemon, heartbeat).

## Quyết định chính

- Không đọc DB Zalo PC; lịch sử cũ (sau này) qua đồng bộ điện thoại chính thức của Zalo Web.
- Nối lại ở tầng app (`retryOnClose:false`), chớp-tắt quá ngưỡng thì dừng hẳn và đòi đăng nhập lại.
- Mã 3000 (phiên Zalo Web khác mở) thì chờ lâu, không giằng co.
- Một daemon mỗi thư mục `data/` (file khóa pid `data/daemon.lock`), một listener mỗi lúc.
- Không bắt người dùng sửa `.env`: mọi thứ cần để dùng (mật khẩu, nick, khóa) làm trên dashboard
  hoặc tự sinh; `.env` chỉ còn các núm vận hành có mặc định.
