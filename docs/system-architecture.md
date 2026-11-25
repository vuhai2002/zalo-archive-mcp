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
cũ (Zalo PC trước khoảng 07/2026) ở `video\<mã tin>` / `voice\<mã tin>` (thêm `group\`; video gửi dạng file cũng dò ở đây),
phần lớn trùng bản trong `resource`. File người dùng tải / mở được Zalo PC lưu, giữ tên thật, ở `Zalo Received Files` - dò theo
tên + cỡ, theo thứ tự: thư mục người dùng chọn trên dashboard (Cài đặt > Đồng bộ và sao lưu, lưu theo nick trong `meta`,
`media/zalo-pc-received-files-dir-setting.ts`), cạnh thư mục dữ liệu thật của Zalo PC (vd `X:\Du-lieu` khi
`%LOCALAPPDATA%\ZaloPC` là liên kết trỏ sang đó), rồi `Documents`. Kho không tự đọc chỗ đặt trong Zalo PC (nằm trong
LevelDB của Zalo PC, bị khóa khi Zalo PC chạy) nên mới có nút chọn. Trình duyệt không cho trang web biết đường dẫn thật
của thư mục chọn, nên nút gọi `POST /api/zalo-pc-media/received-files-dir/pick`: daemon mở hộp thoại chọn thư mục kiểu
mới của Windows (`shared/windows-folder-picker-dialog.ps1`, IFileOpenDialog, cửa sổ chủ vô hình luôn-nằm-trên để hiện
trước trình duyệt) rồi trả đường dẫn về; yêu cầu chờ tới khi người dùng chọn / Hủy.
`media/zalo-pc-media-index.ts` dò theo tên file, `media/find-zalo-pc-copy-for-attachment.ts` chọn các bản có thể dùng,
`media/import-media-from-zalo-pc.ts` chép sang kho (CHỈ ĐỌC thư mục Zalo PC), kiểm chữ ký ảnh / MP4 / AAC, file đính kèm
phải đúng MD5 Zalo ghi trong tin (thử lần lượt từng bản). File trong `fileNoise` bị Zalo PC "làm nhiễu": 100 byte đầu XOR
0x93, cuối thêm 6 byte `zAlO` - `media/zalo-pc-file-copy.ts` bỏ nhiễu lúc chép rồi mới kiểm MD5 (người dùng bảo rõ ngày
2026-11-08). Ảnh lấy bản JPEG xem trước làm file hiện + giữ bản gốc HD cạnh (`<sha>.orig.jxl`), chỉ có JXL thì đổi PNG
(luồng phụ, vài file cùng lúc - xem dưới); đánh `done` kèm `attachments.recovered_from = 'zalo_pc'` (migration 19).
File Zalo PC không ghép được vào tin nào trong kho (tin kho không có, ảnh kiểu cũ `picture\<hội thoại>\z<...>`) thì bỏ,
không giữ bản sao (người dùng chốt 2026-11-08). Chạy theo nút ở Cài đặt > Đồng bộ và sao lưu.

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

Bình chọn nhóm (chỉ xem): tin `group.poll` mang sẵn mẫu câu + câu hỏi + mã trong `content.params` (`archive/zalo-poll-notice.ts`);
lúc ghi tin, chữ thành câu như Zalo và `poll_activity` ghi mốc hoạt động; lúc đọc, câu dựng lại theo danh bạ (như thông báo
nhóm) kèm `poll: { pollId, action }`. Phương án + số phiếu không có trong tin: `daemon/poll-detail-refresher.ts` gọi
getPollDetail (chỉ đọc, mỗi 5 giây tối đa một cuộc, luật chọn ở `storage/poll-store.ts`) và lưu `poll_snapshots`;
`GET /api/polls/:pollId` đổi mã người chọn ra tên + avatar theo danh bạ. Không có lệnh bình chọn nào.

Chế độ trình chiếu (chia sẻ màn hình chỉ hiện vài hội thoại): thẻ Phân loại của Zalo lấy bằng getLabels (chỉ đọc, cùng lượt
đồng bộ bạn bè trong `daemon/directory-lookup-loop.ts`, `zalo/zalo-label-sync.ts`), lưu cả bộ JSON ở bảng meta
(`storage/zalo-label-store.ts`; mã hội thoại nhóm của Zalo có tiền tố "g"), `GET /api/labels` trả kèm các hội thoại kho có.
`GET /api/threads?ids=` lọc danh sách theo id. Phần còn lại ở web: trạng thái nhớ trong localStorage
(`layout/presentation-mode-context.tsx`), cột danh sách riêng lúc trình chiếu, hộp Chia sẻ lọc theo danh sách, hội thoại
khác mở bằng đường dẫn thì chỉ báo đang ẩn. Kho không bao giờ sửa thẻ trên Zalo.

Quản lý dữ liệu (Cài đặt, người dùng chốt 2026-11-09, xóa file giữ tin): đính kèm có trạng thái `removed` (+ `removed_at`,
migration 31 dựng lại bảng `attachments` để thêm vào CHECK, thêm chỉ mục `local_path`). `storage/attachment-file-removal-store.ts`
chỉ xóa đính kèm đã tải (bỏ sticker), ghi DB trước rồi mới xóa file; file trên ổ khử trùng theo nội dung nên chỉ xóa khi không
còn đính kèm nào dùng bất kỳ bản nào cùng tên sha (`mediaFamilyRange`: file chính + `.orig` / `.jxl` đi kèm - "Xóa khỏi kho"
dùng cùng phép kiểm này). Luồng tải / xin link / lấy từ Zalo PC / đồng bộ chọn theo trạng thái cụ thể nên không đụng `removed`;
đồng bộ lại tin không chèn đính kèm mới vì đã có đính kèm cùng loại. `storage/storage-browse-queries.ts`: hội thoại theo dung
lượng và lưới file (tính dung lượng mỗi file một lần). `archive/archive-storage-summary.ts`: đo thư mục kho bất đồng bộ ở nền
(không chặn daemon), nhớ trong `meta`. Route `/api/storage*` (`storage-management-routes.ts`);
`/api/media/:id?download=1` cho Lưu về máy. Thư mục web là `pages/settings/storage/` (tên `data/` trùng luật `.gitignore`).

Cài đặt trên web là cửa sổ (modal) như Zalo PC, không phải trang: shell giữ `openSettings(section)` trong context
(`layout/dashboard-shell-context.ts`), menu bánh răng `layout/sidebar-settings-menu.tsx` và nút khóa khẩn cấp gọi nó.
Điều hướng bên trong cửa sổ (mục, danh sách hội thoại, lưới file) là state `SettingsView` (`pages/settings/settings-view-context.ts`),
không đổi URL; "Xem tin gốc" đóng cửa sổ rồi `navigate` tới tin. Route `/settings/*` chỉ còn để mở cửa sổ đúng mục rồi
chuyển về `/threads` (`settings-route-opener.tsx`). Tài khoản Zalo cũng là một mục của cửa sổ (`pages/zalo-account/zalo-account-panel.tsx`),
riêng `/zalo` khi CHƯA có nick nào vẫn là trang đăng nhập QR lần đầu (shell `AccountGate` đưa mọi trang về đó), có nick
rồi thì `/zalo` mở cửa sổ ở mục Tài khoản (`zalo-account-route.tsx`). `/` chuyển về `/threads`; Tổng quan ở `/overview`. Giao diện: `shared/use-theme.ts` lưu Sáng / Tối trong `localStorage`;
"Theo hệ thống" = xóa khóa đó và đi theo `prefers-color-scheme`.

Thao tác trên một tin ở dashboard (rê chuột: Trả lời, Chia sẻ, Thêm -> Copy / Chọn nhiều tin nhắn / Xóa khỏi kho):
- **Chia sẻ (chuyển tiếp)**: `POST /api/messages/:id/forward` -> `outbox/enqueue-forward-request.ts`: tối đa 100 hội thoại
  (bạn bè lẫn nhóm), mỗi nơi một mục hàng đợi chế độ tin lẻ có `forward_of_message_id` (migration 28), cùng `batch_id`;
  lời nhắn kèm là tin chữ thường ngay sau. Daemon gửi từng nơi bằng `api.forwardMessage({ message }, [threadId])` (mỗi lần
  MỘT nơi để biết mã tin / lỗi của từng nơi: zca-js gửi chung một clientId cho mọi nơi nên kết quả gộp không tách được),
  không báo "đang soạn"; lỗi trong `fail` -> đánh hỏng + bật kill switch. Chỉ tin chữ và link (zca-js chỉ chuyển tiếp chữ).
- **Thả cảm xúc**: nút Thích ở góc bong bóng (rê vào hiện 6 cảm xúc nhanh) -> `POST /api/messages/:id/react`, hoặc lệnh MCP
  `react_to_message` (cùng luật trong `outbox/request-message-reaction.ts`, MCP kiểm daemon sẵn sàng trước) -> ghi
  `reaction_requests` (migration 29) rồi chờ tối đa 8 giây; `outbox/reaction-sender-loop.ts` trong daemon (nửa giây một
  lượt, vòng chung file `daemon/start-recall-and-reaction-loops.ts` với thu hồi) gọi `api.addReaction`, đánh xong / lỗi.
  Chặn khi Chỉ đọc / khóa khẩn cấp; hỏng không bật khóa khẩn cấp. Chỉ tin có mã Zalo thật (tin "mb_..." từ điện thoại thì
  không). Cảm xúc vào kho qua listener như mọi cảm xúc khác.
- **Gửi ngay từ dashboard**: ô nhập trống liền, bong bóng tạm hiện ngay cuối khung chat (`use-pending-outgoing.ts`) tới
  khi tin thật (cùng mã tin) vào kho; không còn dòng "Đã gửi lúc"; hỏng thì bong bóng báo đỏ. Daemon không giả "đang soạn"
  cho tin người dùng tự gõ trên dashboard, và vòng gửi hỏi hàng đợi mỗi nửa giây.
- **Xóa khỏi kho**: `POST /api/messages/delete-preview` (số tin, số file + dung lượng sẽ mất cho hộp xác nhận) rồi
  `POST /api/messages/delete` -> `archive/delete-messages-from-archive.ts` -> `storage/deleted-message-store.ts` (dùng chung
  với lệnh xóa My Documents): xóa tin, đính kèm, cảm xúc, thu hồi, chỉ mục tìm; ghi mã tin vào `deleted_messages`; tính
  lại `threads.last_message_at`; xóa file trên ổ không tin nào khác dùng. `upsertMessage`, `recordRecall`, `applyReaction`
  bỏ qua mã tin đã xóa nên lấy bù / đồng bộ điện thoại / phát lại nhật ký không đưa lại. Không gọi Zalo. Còn sót: chữ
  trong nhật ký thô `raw-events` và các bản sao DB cũ; `archive.db` không tự nhỏ lại (SQLite dùng lại chỗ trống).

Gửi file (lệnh MCP `send_file`, người dùng chốt 2026-11-09): Claude chỉ gửi khi được bảo, liệt kê người nhận + file + chữ và
chờ đồng ý; lệnh đánh dấu phá hủy nên Claude Code / Desktop hỏi duyệt mỗi lần. `outbox/resolve-outbox-files.ts` nhận đường
dẫn tuyệt đối hoặc số đính kèm trong kho, kiểm (có thật, có đuôi, <= 500 MB, tối đa 10 file), chặn cứng file bí mật
(`blocked-secret-files.ts`: .env, khóa, chứng chỉ, kho mật khẩu, thư mục .ssh / .aws...) và dữ liệu nội bộ của kho (mọi thứ
trong DATA_DIR trừ thư mục media), lưu `outbox.files_json` (migration 30). Daemon (`daemon/start-outbox-sender.ts`) đọc file
thành dữ liệu + tên gốc + cỡ ảnh (`media/image-dimensions.ts`) - không đưa đường dẫn vì zca-js tách tên file theo "/" (sai với
đường dẫn Windows) và ảnh theo đường dẫn đòi bộ đọc cỡ ảnh riêng. Thứ tự gửi (`sendFilesThenText`, luật người dùng chốt
2026-11-10: chữ luôn SAU ảnh / file): mọi ảnh trong một lần `sendMessage` (zca-js gắn chung `groupLayoutId` nên Zalo hiện một
chùm, ảnh tải bản gốc nên có HD), rồi file khác trong một lần, rồi tin chữ (nhắc tên + trả lời) sau cùng. Không gửi ảnh chung với
file khác vì zca-js đếm cả file vào số món của chùm.

Hẹn giờ gửi file: `send_file` có `send_date` + `send_time` xếp mục `approved` có `not_before` (cùng đường với
`schedule_message`), daemon gửi đúng giờ như gửi ngay. Vì daemon đọc file lúc gửi (có khi hôm sau), file ngoài kho được chép
ngay lúc hẹn vào `data/accounts/<id>/outbox-files/<mã>/` (`outbox/stage-scheduled-outbox-files.ts`), mục trỏ vào bản chép; ảnh
dán vào Claude (thư mục tạm) hay file Downloads bị xóa trước giờ gửi cũng không sao. Đính kèm có sẵn trong kho giữ đường dẫn.
Bản chép của mục đã gửi / hỏng / hủy được dọn mỗi lần hẹn gửi file mới.

Gửi ảnh / file từ dashboard (khung soạn tin, như Zalo): trình duyệt tải TỪNG file lên `POST /api/outbox/uploads?name=` (thân là
dữ liệu thô `application/octet-stream` - kiểu này cũng phải qua preflight CORS nên giữ lớp chặn CSRF như route JSON; route này
là ngoại lệ duy nhất của luật "POST phải là JSON"). `outbox/dashboard-upload-store.ts` ghi thẳng xuống ổ `outbox-files/<mã>/`
(không giữ cả file trong bộ nhớ, trần 500 MB), rồi `POST /api/outbox` mang `uploads: [{ id, as }]`: `photo` = vào chùm ảnh
(nút Gửi hình ảnh, chỉ jpg / png / webp / gif), `file` = thẻ file kể cả ảnh / video (nút Đính kèm File). zca-js tự chọn kiểu
gửi theo đuôi tên file, nên bản vá zca-js thêm cờ `metadata.asFile`: mục `file` có đuôi ảnh / video / gif mang cờ này để Zalo
hiện thẻ file như gửi tay. Thứ tự gửi vẫn là `sendFilesThenText`. Vòng dọn bản chép chừa thư mục mới hơn 1 giờ (file vừa tải
lên chưa kịp gắn vào tin); dọn mỗi lần gửi file từ dashboard hay hẹn gửi file qua MCP.

Định dạng tin nhắn (thanh của Zalo: đậm, nghiêng, gạch chân, gạch ngang, 4 màu, cỡ Nhỏ 13px / Lớn 18px / Rất lớn 20px, gạch
đầu dòng, đánh số, thụt lề): ô soạn là contenteditable dùng `document.execCommand` (hoàn tác có sẵn);
`composer-rich-content-reader.ts` đọc cây DOM thành chữ + mã Zalo (`b,c_db342e,f_20`; mỗi dòng danh sách một mục `lst_1` /
`lst_2` phủ trọn dòng; `ind_N0` thụt N bậc), chỉ nhận đúng bộ mã đó. Dán khi bật thanh: HTML đi qua bộ đọc rồi được dựng lại
bằng `composer-rich-content-writer.ts` (kho tự dựng HTML từ chữ thuần, không chèn HTML lạ); tắt thanh thì dán chữ trơn. Máy
chủ kiểm mã lần nữa (`outbox/outbox-text-styles.ts`), lưu `outbox.styles_json` (migration 33), daemon gửi kèm `styles` cho
zca-js (thành `textProperties` như Zalo tự gửi). Tin có danh sách / thụt lề vẽ như Zalo Web (đo DOM): mỗi dòng một khối cao
22px, danh sách là thẻ `ul` / `ol` thật cách trên dưới 15px, chữ lùi 40px, danh sách con lùi thêm 30px (`rich-text-lines.ts`
dựng cây). Dấu chấm tròn / số do trình duyệt vẽ nên chép tin không dính dấu vào chữ, dán lại vào khung soạn vẫn ra danh sách.

MCP cũng gửi được chữ có định dạng: Claude viết kiểu markdown (`**đậm**`, `*nghiêng*`, `~~gạch~~`, dòng `- ` / `1. `, thụt để
lồng) cộng vài thẻ ngắn cho thứ markdown không có (`<u>`, `<red>` `<orange>` `<yellow>` `<green>`, `<small>` `<big>` `<huge>`);
`outbox/markdown-to-zalo-styles.ts` đổi thành chữ trơn + mã Zalo trước khi xếp hàng (dùng cho send_message, schedule_message,
draft_message, chữ của send_file và từng tin của send_batch). Dấu chỉ có tác dụng khi đứng đúng chỗ như markdown (`2*3*4`,
`ten_bien` giữ nguyên), dấu thiếu cặp giữ là chữ. `send_file` có `as_file` để gửi ảnh / video thành thẻ file. Khi đọc,
`read_thread` / `search_messages` thêm lại "- " / "1. " và thụt lề cho tin có danh sách (`mcp/format-rich-text-for-model.ts`).

`search_messages` (`mcp/search-messages-tool.ts`) đếm tổng số tin khớp (`countMessages`) và phân trang bằng `offset`; lọc người
gửi bằng `sender_id`, `sender_name` (`storage/message-sender-lookup.ts`: so không dấu với tên gợi nhớ / tên Zalo / tên trong
tin, trùng nhiều người thì trả danh sách để chọn) hoặc `from_me` (`meta.self_uid`). `read_thread` báo tổng tin của hội thoại và
số tin cũ / mới hơn trang đang đọc (`storage/thread-position-counts.ts`).

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
- lô: tới bạn bè lẫn người chưa kết bạn (không nhóm), thêm nhịp ngẫu nhiên, khung giờ, trần ngày (tin lô phải chờ thì
  dời riêng nó).

Lỗi gửi đầu tiên bật kill switch. Ngoại lệ (`outbox/non-friend-send-failure-guard.ts`): tin 1-1 tới người chưa kết bạn hỏng
(họ không nhận tin người lạ, chặn mình...) chỉ đánh `failed` tin đó; 3 người chưa kết bạn khác nhau hỏng liền nhau (không có
lần gửi được nào xen giữa) thì bật kill switch vì nhiều khả năng chính nick bị Zalo giới hạn nhắn người lạ. Mục `sending` bỏ dở
thành `failed`, không tự gửi lại. Cài đặt gửi: mặc định `.env`, sửa trên dashboard lưu `meta.send_settings`.

### Tra số điện thoại (lookup_phones)

Để nhắn người chưa kết bạn từ một danh sách số điện thoại. Lệnh MCP `lookup_phones`
(`mcp/phone-lookup-tool.ts`) chuẩn hóa số (`phone-lookup/phone-lookup-rules.ts`: chỉ số di động Việt Nam, nhận `0...`, `+84...`,
`84...`, có dấu chấm / cách, 9 chữ số thiếu số 0 đầu), xếp vào bảng `phone_lookups` (migration 34, khóa `84xxxxxxxxx`) và trả kết
quả đã có. Vòng `phone-lookup/phone-lookup-loop.ts` trong daemon tra từng số như gõ số vào ô Tìm kiếm của Zalo Web
(`zalo/zca-phone-lookup-api.ts`: `friend/profile/get` với `reqSrc: 85`; `findUser` của zca-js dùng 40): nhịp ngẫu nhiên, trần
ngày đếm TỪNG LẦN GỌI Zalo (bảng `phone_lookup_calls`: tra lại, thử lại, số mốc đều tính), chỉ trong khung giờ của lô; Chỉ đọc
/ kill switch / listener rớt thì không gọi Zalo. Kết quả:
- có người: lưu tên Zalo + mã, thêm dòng `threads` (chưa có tin nên không hiện trong danh sách hội thoại) + danh bạ để
  `send_batch` / `send_message` gửi được; tên đã có không bị đè, cờ bạn bè giữ nguyên;
- mã 216 / 212 / 210 (chưa có Zalo, không cho tìm, tài khoản bị khóa): `no_zalo`;
- mã lạ (có thể Zalo chặn tra): số đó ghi mã + câu và xuống cuối hàng (để không chặn các số sau; 3 lần thì `failed`), cả vòng
  tạm dừng tới khung giờ ngày mai (`meta.phone_lookup_pause`, lý do nêu số); không bật kill switch;
- 10 số liền `no_zalo`: các lượt sau (theo nhịp + trần như mọi lượt, `phone-lookup/phone-lookup-anchor-check.ts`) tra lại tối đa
  2 số có Zalo gần nhất làm mốc; một mốc vẫn ra là Zalo không chặn (mốc nào vừa ẩn tìm kiếm thì ghi `no_zalo`); mọi mốc đều không
  ra thì đưa chuỗi về chờ và tạm dừng, để không ghi nhầm "không có Zalo" khi thật ra bị chặn;
- lỗi mạng: thử lại, 3 lần thì `failed`.
Mỗi số tra một lần rồi giữ cho mọi đợt gửi sau; `recheck` tra lại số không có / lỗi, `cancel` bỏ số còn chờ. Khi còn số chờ mà
vòng tra đứng, `lookup_phones` nêu lý do (khóa khẩn cấp, daemon / listener chưa chạy, ngoài khung giờ, đủ trần, tạm dừng).

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
  trình duyệt và bộ lọc Nhắc bạn / Biểu cảm; tab Tin nhắn / File lọc người gửi trên cả kho qua `GET /api/senders?q=`
  và ngày gửi), tìm trong một hội thoại ở bảng bên phải (lọc người gửi, ngày gửi). Bấm kết quả là mở hội thoại tại đúng tin (`?msg=`, API `aroundId`); đang xem đoạn cũ thì cuộn xuống
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

Mỗi lượt lấy bù ghi kết quả theo hàng chờ vào `backfill_runs` (migration 35): `complete` khi Zalo báo hết trang và không
báo bỏ bớt phần cũ; `incomplete` kèm lý do khi dừng dở (chạm trần trang, trang không về, mất kết nối giữa chừng, Zalo bỏ
bớt phần cũ, gửi lệnh lỗi); đăng nhập lại bằng QR sau một quãng không nghe ghi `new_session` (phiên mới không được gửi
bù). `listener-gap-backfill.ts` gắn cho mỗi khoảng đã nối lại: lượt lấy bù quanh lúc nối lại (2 phút trước tới 30 phút
sau) của hai hàng chờ TIN đều xong là "đã lấy bù đủ" (kèm số tin Zalo gửi lại), có `new_session` hay chỉ có lượt dừng dở
là "có thể thiếu" (kèm lý do, cách lấy lại: đồng bộ từ điện thoại), không có lượt nào là "chưa rõ" (khoảng trước khi có
bảng này, hay nối lại liền không xin bù); cộng số tin kho đang có trong khoảng. `sync_status` và thẻ "Khoảng mất kết nối"
ở Tổng quan hiện các nhãn này, không còn gọi chung mọi khoảng là "có thể thiếu".

Hai đường để khoảng không nghe không bị "chưa rõ":
- Máy thức mà kết nối sống qua giấc ngủ (không có lần nối lại nào): vòng heartbeat thấy máy vừa thức thì chủ động xin bù
  (`requestMissedNow`, không chờ khoảng tối thiểu giữa hai lượt). Lượt nào dừng dở thì lần kết nối sau xin lại ngay.
- Đồng bộ từ điện thoại xong thì ghi khoảng nó phủ (`phone_sync_coverage`, migration 36, `phone-sync-coverage-store.ts`):
  khoảng không nghe nằm trọn trong đó hiện "Đã đồng bộ từ điện thoại". Nhãn "chưa rõ" / "có thể thiếu" chỉ cách này.

## Bảng chính (`src/storage/archive-schema-migrations.ts`)

`messages` (UNIQUE msg_id, cột `source`), `messages_fts`, `message_recalls`, `attachments`,
`threads`, `connection_events` (tính khoảng listener không nghe), `backfill_runs` (kết quả mỗi lượt lấy bù),
`phone_sync_coverage` (khoảng các lượt đồng bộ điện thoại đã phủ),
`outbox` (mode single/batch),
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
