# Kiến trúc hệ thống

Ba tiến trình trên máy nhà, chung một file SQLite (WAL) mỗi account:

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

Parser sai: sửa code, `pnpm replay-journal` dựng lại (giữ `source`/`received_at` của lần đầu).

## Luồng gửi

```
MCP send_message / dashboard "Gửi ngay" / CLI  -> outbox (approved, mode single|batch)
   -> daemon OutboxSender (2 giây kiểm một lần) -> send-policy.ts -> sending -> sent | failed
draft_message / dashboard "Lưu nháp" -> outbox (draft) --(Duyệt trên dashboard)--> approved
```

Cổng kiểm LÚC GỬI và kiểm lại ngay trước khi gọi Zalo:
- tin lẻ: kill switch + cách tin trước tối thiểu vài giây;
- lô: thêm chỉ bạn bè, nhịp ngẫu nhiên, khung giờ, trần ngày (tin lô phải chờ thì dời riêng nó).

Lỗi gửi đầu tiên bật kill switch. Mục `sending` bỏ dở thành `failed`, không tự gửi lại.
Cài đặt gửi: mặc định `.env`, sửa trên dashboard lưu `meta.send_settings`.

## Dashboard

Chạy trong tiến trình daemon (`src/dashboard`), phục vụ `web/dist`. Hợp đồng API:
`src/dashboard/dashboard-api-contract.ts`. Phiên Zalo do `ZaloSessionManager` quản lý (QR qua web,
chạy/dừng/đăng xuất), trạng thái ghi `meta.daemon_session_state` để MCP biết daemon gửi được không.

## Bảng chính (`src/storage/archive-schema-migrations.ts`)

`messages` (UNIQUE msg_id, cột `source`), `messages_fts`, `message_recalls`, `attachments`,
`threads`, `connection_events` (tính khoảng listener không nghe), `outbox` (mode single/batch),
`send_control` (kill switch), `meta` (cài đặt gửi, trạng thái daemon, heartbeat).

## Quyết định chính

- Không đọc DB Zalo PC; lịch sử cũ (sau này) qua đồng bộ điện thoại chính thức của Zalo Web.
- Nối lại ở tầng app (`retryOnClose:false`), chớp-tắt quá ngưỡng thì dừng hẳn và đòi đăng nhập lại.
- Mã 3000 (phiên Zalo Web khác mở) thì chờ lâu, không giằng co.
- Một daemon mỗi account (file khóa pid).
