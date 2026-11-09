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
   khử trùng theo `msg_id`, cập nhật FTS (chữ đã bỏ dấu), thêm đính kèm `pending` (mỗi tin tối đa
   một đính kèm mỗi loại: cùng ảnh tới lại với link khác thì không thêm), áp lệnh thu hồi tới trước,
   cập nhật hội thoại. Lệnh "xóa ở phía tôi" (`chat.delete`): kho vẫn giữ tin, trừ My Documents
   (mã `loginInfo.send2me_id`, lưu meta `my_documents_thread_id` lúc đăng nhập) - ở đó tin bị xóa hẳn
   (cả đính kèm, file không tin nào dùng chung) và mã tin ghi vào `deleted_messages` để lấy bù / đồng bộ
   điện thoại sau không đưa vào lại (`my-documents-deletion-store.ts`, người dùng chốt 03/11/2026). Lệnh
   xóa cũ nằm trong nhật ký được áp dụng một lần lúc khởi động (`my-documents-past-deletes-backfill.ts`).
4. `media-download-worker.ts` tải từng đính kèm (chỉ host CDN Zalo, kiểm mỗi bước redirect),
   lưu theo sha256.
5. Link hết hạn (403/404/410, hoặc CDN trả 200 kèm trang báo hết hạn): `media-link-renewer.ts`
   xin Zalo cấp lại link qua `renewlink` (cmd 12094, tham số như bước chuyển tiếp của Zalo Web:
   file 1 / ảnh 2 / video 5). Zalo thường trả `{async: true}` rồi gửi link qua sự kiện điều khiển
   WS cmd 601 `act = "renew_link"` - `renew-link-control-listener.ts` đọc thẳng khung WS (zca-js bỏ
   qua sự kiện này), ghép theo link gốc, chờ tối đa 30 giây. Mỗi file một lần tự động; các lệnh
   cách nhau ngẫu nhiên 4-10 giây, trần 200/ngày (lượt cấp lúc xếp hàng, quá trần sang ngày sau).
   Dashboard có nút "Thử lại" trên file hỏng. Zalo xóa file cũ khỏi máy chủ (ảnh đo được sau khoảng
   2 tuần) và từ chối cấp lại link (mã 1001); không có số liệu chính thức. `zalo-deleted-media-store.ts`
   suy theo từng loại file: Zalo đã từ chối ít nhất 3 file cùng loại gửi cùng lúc hoặc SAU file này, và
   7 ngày qua chưa cấp lại được file cùng loại nào cũ hơn, thì đóng file luôn, không xếp lượt, không gọi
   Zalo. Lúc khởi động: đóng các file đang chờ lượt mà Zalo đã xóa, trả lại lượt của chúng, cấp lượt mới
   cho phần còn lại theo tin mới nhất trước (file mới dễ cứu hơn), trần ngày vẫn tính số lệnh đã gửi.
   File của tin cũ hơn `MEDIA_ASSUME_DELETED_AFTER_DAYS` (mặc định 40) ngày mà quy tắc trên coi là Zalo đã xóa
   thì đóng ngay khi tới lượt tải, không gọi máy chủ: máy chủ Zalo gần như không còn trả
   file cũ quá vài tuần, đồng bộ toàn bộ lịch sử mà vẫn thử từng file thì mất nhiều ngày và file của tin mới phải xếp
   sau. Chỉ mục riêng cho file đã được cấp link mới (migration 20) giữ mỗi lần kiểm rất nhanh.

Thông báo nhóm (`msg_type = 'group_event'`): sự kiện nhóm của zca-js và tin webchat `msginfo.actionlist`
("X vừa yêu cầu tham gia nhóm.", "X xác nhận: tham gia <lịch hẹn>."). Câu theo mẫu tiếng Việt của Zalo Web
(`archive/zalo-system-notice.ts`: "Quế Khuê được Mẫn Khuê thêm vào nhóm"); lúc đọc
(`storage/system-notice-display.ts`) dựng lại từ dữ liệu gốc theo danh bạ hiện tại - tên gợi nhớ, tên in
đậm, avatar nhỏ người được nhắc tới - nên chữ lưu lúc chưa biết tên (mã số) vẫn hiện đúng.

Lấy lại media Zalo đã xóa từ Zalo PC: Zalo xóa ảnh / video / file khỏi máy chủ sau khoảng 2 tuần, nên
tin cũ (đồng bộ điện thoại) thường không còn file. Zalo PC trên máy đã tải nhiều file trong số đó vào
`%LOCALAPPDATA%\ZaloPC\<UID>\ZaloDownloads` dưới dạng file thường: ảnh / video ở
`resource\<g<mã nhóm> | mã người>\<picture | Cache | video | file | fileNoise | voice>\<cliMsgId>_<người gửi>_<hội thoại>...`
(video gửi dạng file cũng ở `video`), file đính kèm theo checksum ở `file\<md5>` / `fileNoise\<md5>`; video / tin thoại kiểu
cũ (Zalo PC trước khoảng 07/2026) ở `video\<mã tin>` / `voice\<mã tin>` (thêm `group\`), phần lớn trùng bản trong
`resource`. Zalo PC bản cũ còn lưu file nhận được, giữ tên thật, ở `Zalo Received Files` (cạnh thư mục dữ liệu thật
của Zalo PC, vd `X:\Du-lieu` khi `%LOCALAPPDATA%\ZaloPC` là liên kết trỏ sang đó, hoặc `Documents`) - dò theo tên + cỡ.
`media/zalo-pc-media-index.ts` dò theo tên file, `media/find-zalo-pc-copy-for-attachment.ts` chọn các bản có thể dùng,
`media/import-media-from-zalo-pc.ts` chép sang kho (CHỈ ĐỌC thư mục Zalo PC), kiểm chữ ký ảnh / MP4 / AAC, file đính kèm
phải đúng MD5 Zalo ghi trong tin (thử lần lượt từng bản). File trong `fileNoise` bị Zalo PC "làm nhiễu": 100 byte đầu XOR
0x93, cuối thêm 6 byte `zAlO` - `media/zalo-pc-file-copy.ts` bỏ nhiễu lúc chép rồi mới kiểm MD5 (người dùng bảo rõ ngày
2026-11-08). Ảnh lấy bản JPEG xem trước làm file hiện + giữ bản gốc HD cạnh (`<sha>.orig.jxl`), chỉ có JXL thì đổi PNG
(luồng phụ, vài file cùng lúc - xem dưới); đánh `done` kèm `attachments.recovered_from = 'zalo_pc'` (migration 19).
File Zalo PC không ghép được vào tin nào trong kho (tin kho không có, ảnh kiểu cũ `picture\<hội thoại>\z<...>`) thì bỏ,
không giữ bản sao (người dùng chốt 2026-11-08). Chạy theo nút trên trang Tài khoản Zalo.

Đổi ảnh JXL sang PNG (trình duyệt không hiện JXL) tốn vài giây một ảnh lớn, phần lớn là mã hóa PNG, và
chặn luồng đang chạy. Daemon chỉ có một luồng chính cho dashboard + listener + hàng đợi gửi, nên việc đổi chạy ở
luồng phụ: `media/jxl-png-worker-pool.ts` giữ tối đa `JXL_CONVERT_WORKERS` luồng (mặc định 4, dùng chung cho tải
media và lấy từ Zalo PC), mỗi luồng đổi một ảnh, luồng rảnh 30 giây thì tắt để trả bộ nhớ WASM. Lấy từ Zalo PC
chép / đổi chừng ấy file cùng lúc.

Parser sai: sửa code, `pnpm replay-journal` dựng lại (giữ `source`/`received_at` của lần đầu).

## Luồng gửi

```
MCP send_message / dashboard "Gửi ngay" / CLI  -> outbox (approved, mode single|batch)
   -> daemon OutboxSender (2 giây kiểm một lần) -> send-policy.ts -> sending -> sent | failed
draft_message / dashboard "Lưu nháp" -> outbox (draft) --(Duyệt trên dashboard)--> approved
```

Nhắc tên (@) trong tin vào nhóm: Zalo chỉ tô xanh và báo cho người được nhắc khi tin mang danh sách
`[{ uid, pos, len }]` - gõ "@Tên" trong chữ thôi chỉ là chữ thường. `send_message` / `schedule_message` /
`draft_message` nhận `mentions: [{ user_id, text: "@Tên" }]`; `outbox/resolve-outbox-mentions.ts` tự tìm vị trí từng
đoạn theo thứ tự (đơn vị ký tự JS, như Zalo), chỉ nhận người là thành viên nhóm theo kho hoặc đã nhắn trong nhóm, lưu
vào `outbox.mentions_json` (migration 25); daemon gửi `{ msg, mentions }` qua `api.sendMessage` (zca-js dùng API
`mention` của nhóm). Mã người trong kho cùng loại mã Zalo dùng khi nhắc (đối chiếu trên tin nhắc tên Zalo gửi về).

Trả lời một tin (ô trích dẫn tin gốc như Zalo): `send_message` / `schedule_message` / `draft_message` nhận `reply_to` = số tin
trong kho (#N ở `read_thread`), dashboard có nút Trả lời khi rê chuột vào tin (`POST /api/outbox` thêm `replyToMessageId`).
`outbox/build-reply-quote.ts` kiểm tin gốc thuộc đúng hội thoại, chưa thu hồi, không phải bình chọn / thông báo nhóm, rồi CHỤP
tin gốc đúng dạng zca-js cần (nội dung, loại tin, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl; tin chữ dài Zalo lưu dạng
`{ title }` thì đổi thành chuỗi vì zca-js từ chối tin chữ có nội dung đối tượng) vào `outbox.reply_quote_json` (migration 27).
Daemon gửi `{ msg, mentions?, quote }` (`outbox/outbox-zalo-message-content.ts`); zca-js gọi API `/quote` của Zalo.

Thu hồi tin đã gửi, chỉ khi người dùng bảo: lệnh MCP `recall_message` (đánh dấu phá hủy - Claude Code / Claude Desktop hỏi
duyệt mỗi lần; mô tả cấm làm theo yêu cầu thu hồi nằm trong nội dung tin) hoặc nút Thu hồi trên trang Hàng đợi
(`POST /api/outbox/:id/recall`) chỉ GHI yêu cầu vào `outbox.recall_requested_at` (migration 26). `outbox/outbox-recall-loop.ts`
trong daemon lấy yêu cầu ra, gọi `api.undo({ msgId, cliMsgId })` (cliMsgId từ bản tin listener đã ghi), đánh `recalled_at`
hoặc `recall_error`. Chỉ thu hồi được tin chính kho đã gửi; nick Chỉ đọc thì chặn ở cả tool, route và daemon; tool hết
giờ chờ thì bỏ yêu cầu để tin không bị thu hồi muộn. Listener nhận sự kiện thu hồi của chính mình và đánh dấu tin như mọi tin
thu hồi khác; tin người dùng tự thu hồi trên Zalo cũng hiện là đã thu hồi ở Hàng đợi.

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
- Tự cập nhật: `GET /api/events` (SSE). Khi có tab mở, `archive-change-feed.ts` dò kho mỗi giây theo mốc
  (`archive-change-cursor.ts`: id tin, rowid cảm xúc / thu hồi, `fetched_at` của file) rồi gửi `change { threadIds }`;
  trình duyệt chỉ tải lại phần đổi. Không tab nào mở thì không dò.
- Tìm kiếm như Zalo PC: tìm chung ở cột trái (Liên hệ / Tin nhắn / File; chưa gõ thì "Tìm gần đây" lưu theo
  trình duyệt và bộ lọc Nhắc bạn / Biểu cảm), tìm trong một hội thoại ở bảng bên phải (lọc người gửi, ngày
  gửi). Bấm kết quả là mở hội thoại tại đúng tin (`?msg=`, API `aroundId`); đang xem đoạn cũ thì cuộn xuống
  tải tiếp (`afterId`), tin mới tới không chèn vào giữa cho tới khi về tin mới nhất.
- Route kho / gửi / cài đặt / media dựng riêng cho từng nick (một lần), mỗi yêu cầu đi vào bộ route
  của nick đang dùng; chưa có nick thì 409.

Khóa mã hóa cookie tự sinh (`data/app-secrets.json`); máy chạy bản cũ thì lấy
`CREDENTIALS_ENCRYPTION_KEY` trong `.env` một lần. Danh sách nick dựng từ các thư mục
`data/accounts/*` có sẵn nếu chưa có `accounts.json`.

## Danh bạ (tên, avatar)

`directory-lookup-loop.ts` hỏi Zalo những gì tin không mang theo: tên + avatar nhóm, hồ sơ người nhắn,
ảnh sticker, danh sách bạn bè. Hồ sơ chỉ hỏi cho người kho thật sự hiện (đã gửi tin, người kia của hội
thoại 1-1, 4 thành viên đầu nhóm chưa có ảnh) - hỏi cả nhóm đông là hàng nghìn người, Zalo chặn ngay
(mã 221). Mỗi lượt 50 người, cách nhau tối thiểu `DIRECTORY_CONTACT_LOOKUP_GAP_SECONDS`; bị chặn thì
lượt đó không tính là đã hỏi và loại hỏi bị chặn nghỉ `DIRECTORY_RATE_LIMIT_PAUSE_MINUTES`, gấp đôi mỗi lần
bị lại, tối đa 6 tiếng. Hỏi nhóm và hỏi hồ sơ nghỉ RIÊNG (`meta.directory_lookup_pause_groups` /
`meta.directory_lookup_pause`): sau đồng bộ điện thoại, lệnh hỏi hồ sơ có thể bị chặn cả ngày, nhóm mới không
phải chờ theo. Trong lúc nghỉ, danh sách bạn bè và ảnh sticker (lệnh khác, không bị chặn) vẫn chạy. Nhóm
chưa hỏi lần nào mà biết ít thành viên hơn tổng số (mới chỉ nghe sự kiện "có người vào nhóm") vẫn coi là thiếu,
hỏi để ghép đủ avatar nhóm. Mỗi nhóm hỏi một lần: Zalo đã trả nhóm mà vẫn thiếu là thứ Zalo không có (nhóm không đặt
ảnh, nhóm đông Zalo không trả đủ danh sách); đổi tên / ảnh / thành viên về sau đi theo sự kiện nhóm (đổi ảnh thì hỏi
lại một lần). Zalo không trả hồ sơ / nhóm (tài khoản đã xóa, nhóm đã rời), trả hồ sơ trống, hoặc báo lỗi thì hỏi lại
sau một ngày, tổng cộng tối đa 3 lần (`MAX_LOOKUP_ATTEMPTS`, đếm ở `contacts.lookup_attempts` /
`threads.name_lookup_attempts`) rồi thôi. Mất mạng (máy vừa bật) không tính là đã hỏi. Lúc đọc, tin không kèm tên người gửi (bản sao lưu điện thoại) lấy tên trong danh bạ.
Tên gợi nhớ mình đặt cho người khác (`getAliasList`, đồng bộ cùng danh sách bạn bè, lưu `contacts.alias`)
đứng trước mọi tên khác ở danh sách, đầu khung chat, tên người gửi, xem trước, tìm kiếm và MCP - như Zalo PC.

## Lấy bù tin lỡ

Mỗi lần listener kết nối, `offline-message-replay.ts` xin Zalo gửi bù từ năm hàng chờ: tin 1-1 (cmd 510),
vài giây sau tin nhóm (511), rồi cảm xúc 1-1 (610), cảm xúc nhóm (611) và hàng chờ điều khiển (603, lệnh
con 0) - nơi Zalo giữ sự kiện nhóm (thêm / rời / xóa / đổi tên) lỡ lúc tắt máy. zca-js không xin cũng không
đọc phản hồi 603, nên `offline-group-event-replay.ts` đọc thẳng khung WS, chỉ lấy loại "group" và cho đi
chung đường ghi với sự kiện trực tiếp; sự kiện cũ hơn lần hỏi thông tin nhóm gần nhất không được đè tên /
số thành viên mới hơn. Nối lại trong vòng
`OFFLINE_REPLAY_MIN_INTERVAL_MINUTES` thì không xin lại. Tin / cảm xúc trả về khử trùng như mọi sự kiện.

Như Zalo Web: mỗi hàng chờ xin TỪ MỐC đã lưu (`meta.offline_replay_cursors`, id của việc mới nhất kho đã
có), rồi theo `more` + `lastActionId` lật trang tới khi Zalo báo hết (trần 30 trang). Mỗi trang về là lưu
mốc, nên chạm trần hay rớt kết nối giữa chừng thì lần sau đi tiếp. Lấy bù xong một hàng chờ thì tin /
cảm xúc nhận trực tiếp đẩy mốc lên (cùng hệ id), để lần tắt máy sau chỉ xin phần thật sự lỡ. Chưa có
mốc thì xin từ đầu hàng chờ; xin từ mốc mà Zalo không trả lời thì bỏ mốc. zca-js 2.2.0 bỏ mất `more` /
`lastActionId`, bản vá zca-js phát thêm `old_messages_meta` / `old_reactions_meta`.

Lấy bù chỉ chạy được trên phiên CŨ. Phiên đăng nhập mới bằng QR (vd Zalo hủy phiên vì đổi vị trí) bị Zalo coi
như máy mới: lấy bù trả 0 tin. Vì vậy:
- đăng nhập bằng cookie lúc khởi động mà lỗi mạng thì tự thử lại (giãn dần như nối lại listener), không bỏ phiên;
- đăng nhập lại bằng QR mà heartbeat cuối cách đó từ 10 phút thì kho ghi quãng có thể thiếu tin
  (`phone-sync-suggestion-store.ts`, meta `phone_sync_suggestion`); dashboard nhắc đồng bộ từ điện thoại đúng quãng
  đó, đồng bộ xong phủ được quãng thì tự thôi nhắc.

Khoảng không nghe (`connection_events`, hiện ở Tổng quan và `sync_status`): listener ghi lúc đóng / nối
lại; tiến trình chết đột ngột thì lần khởi động sau ghi bù theo heartbeat cuối; máy ngủ thì vòng
heartbeat (mỗi phút) thấy hai nhịp cách nhau quá 3 phút theo giờ máy và ghi bù khoảng đó
(`recordSuspendGap`), vì lúc ngủ WebSocket chết im lặng, listener chỉ biết khi máy đã thức.

## Bảng chính (`src/storage/archive-schema-migrations.ts`)

`messages` (UNIQUE msg_id, cột `source`), `messages_fts`, `message_recalls`, `attachments`,
`threads`, `connection_events` (tính khoảng listener không nghe), `outbox` (mode single/batch),
`send_control` (kill switch), `meta` (cài đặt gửi, trạng thái daemon, heartbeat).

## Quyết định chính

- Không đọc DB Zalo PC; lịch sử cũ (sau này) qua đồng bộ điện thoại chính thức của Zalo Web.
- Nối lại ở tầng app (`retryOnClose:false`), chớp-tắt quá ngưỡng thì dừng hẳn và đòi đăng nhập lại.
- Mã 3000 (phiên Zalo Web khác mở) thì chờ lâu, không giằng co. Riêng lần 3000 đầu tiên kể từ lần kết nối
  đứng gần nhất thì thử lại sau `RECONNECT_DUPLICATE_FIRST_RETRY_SECONDS` (60): Zalo cũng trả 3000
  "NOT_AUTHENTICATED" lúc vừa mở máy, Zalo PC khởi động cùng lúc. Dashboard hiện mã đóng + giờ tự nối lại
  và nút "Nối lại ngay" (`POST /api/session/reconnect`). Kết nối đóng giữa lượt lấy bù thì giữ nguyên mốc
  (trang không về vì mất kết nối, không phải Zalo chê mốc) và lần nối sau xin lại ngay.
- Một daemon mỗi thư mục `data/` (file khóa pid `data/daemon.lock`), một listener mỗi lúc.
- Không bắt người dùng sửa `.env`: mọi thứ cần để dùng (mật khẩu, nick, khóa) làm trên dashboard
  hoặc tự sinh; `.env` chỉ còn các núm vận hành có mặc định.
