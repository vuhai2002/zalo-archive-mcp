# Changelog

Bản gọn theo tính năng. Ví dụ và số liệu chỉ mô tả hành vi, không lấy từ dữ liệu thật của ai.

## 2026-10-28 - 2026-10-29: nền tảng kho (0.1.0 - 0.4.0)

- Kho SQLite mỗi nick: tin 1-1 và nhóm (cả tin mình gửi), thu hồi, đính kèm, hội thoại; tìm toàn văn không dấu.
- Listener zca-js (`selfListen`, bản vá nhận tin 1-1 cmd 551), nhật ký JSONL thô ghi trước khi parse, `pnpm replay-journal`.
- Nối lại ở tầng app: backoff, chờ lâu khi bị phiên Zalo Web khác đá, phân biệt mất mạng với phiên chết, ghi khoảng máy ngủ.
- Tải media từ CDN Zalo: kiểm host mỗi bước redirect, trần cỡ, sha256, thử lại; ảnh JPG hỏng thì lấy bản JXL gốc đổi sang PNG.
- Xin Zalo cấp lại link media hết hạn rồi tải lại, có giãn nhịp và trần mỗi ngày.
- Lấy bù tin lỡ nhiều trang và lấy bù cảm xúc sau khi tắt máy.
- Đồng bộ lịch sử cũ từ điện thoại (giải mã bản sao lưu, đổi id điện thoại sang id web, không nhập trùng).
- Lưu cảm xúc và sự kiện nhóm (thêm, rời, đổi tên, đổi ảnh, phó nhóm...) thành tin hệ thống giữa khung chat.
- Hàng đợi gửi + cổng gửi ở daemon: tin lẻ chỉ giãn vài giây; gửi nhiều người có nhịp ngẫu nhiên, khung giờ, trần ngày,
  chỉ tới bạn bè; khóa khẩn cấp tự bật ở lỗi gửi đầu tiên, không bao giờ gửi lại.
- MCP stdio: đọc, tìm, gửi ngay, hẹn giờ, gửi nhiều người, nháp; nội dung tin bọc ranh giới chống prompt injection.
- Dashboard web (Hono + React): thiết lập hoàn toàn trên dashboard (mật khẩu lần đầu, đăng nhập Zalo bằng QR), đổi nick
  giữ dữ liệu, chế độ Chỉ đọc theo nick, chỉ nghe 127.0.0.1, chặn Host lạ.
- Tự chạy daemon ẩn khi đăng nhập Windows, lệnh dừng daemon.
- Giao diện kiểu Zalo PC: thanh icon, khung chat bong bóng, định dạng chữ, album ảnh dạng lưới, thẻ thông báo, tin cuộc gọi,
  mã biểu cảm, bảng thông tin hội thoại, ghim, tìm trong danh sách, scrollbar mảnh.

## 2026-10-30 - 2026-11-03: hiển thị và lấy lại dữ liệu

- Dashboard tự cập nhật bằng Server-Sent Events, không cần tải lại trang.
- Tìm kiếm kiểu Zalo PC: tìm trong hội thoại, lọc người gửi / ngày, Nhắc bạn / Biểu cảm, nhảy tới đúng tin.
- Tên gợi nhớ ở mọi chỗ, xem trước đủ tên + biểu tượng, thẻ cuộc gọi, mục Thành viên và Link.
- Xem ảnh / video ngay trong dashboard; icon riêng cho dashboard.
- Thông báo nhóm theo đúng mẫu câu của Zalo, lấy bù sự kiện nhóm lỡ lúc tắt máy.
- Trang Tổng quan gọn lại: khoảng mất kết nối, sự kiện kết nối.
- File Zalo đã xóa khỏi máy chủ hiện "Đã hết hạn" như Zalo, không phí lượt xin lại link.
- Lấy lại ảnh / video / file Zalo đã xóa từ bản Zalo PC trên máy (chỉ đọc thư mục Zalo PC, không sửa).
- Đồng bộ toàn bộ lịch sử từ điện thoại: thử lại khi tải bản sao lưu, nhập nhanh hơn nhiều lần.
- Tải ảnh gif chọn trong Zalo (bản chép của Zalo mất thì lấy bản Tenor gốc).
- My Documents: tin bạn xóa trên Zalo thì kho xóa theo; tin thu hồi ẩn sau nút con mắt; thẻ danh thiếp; bấm trích dẫn
  nhảy tới tin gốc.

## 2026-11-06 - 2026-11-09: gửi tin như Zalo, quản lý dữ liệu

- Tự thử lại đăng nhập khi mạng chưa sẵn lúc bật máy; nhắc đồng bộ từ điện thoại khi phiên mới có thể thiếu tin.
- Tin link như Zalo (chữ đầy đủ, thẻ xem trước), nhắc tên (@) tô xanh, nhảy tới tin dài thấy đầu tin.
- Chùm ảnh xếp theo thuật toán của Zalo PC; khung soạn tin kiểu Zalo (hẹn giờ, lưu nháp, Enter gửi).
- Lấy từ Zalo PC thêm file bị làm nhiễu, video gửi dạng file, tin thoại; đổi JXL sang PNG ở luồng phụ.
- Gửi qua kho có nhắc tên (@), trả lời (trích dẫn), thu hồi (chỉ khi được bảo); thả cảm xúc; gửi ngay như Zalo.
- Chia sẻ (chuyển tiếp) một tin tới nhiều hội thoại trên dashboard; Xóa khỏi kho (xóa tin + file không ai dùng).
- MCP `send_file`: gửi file / ảnh / video (chặn cứng file bí mật và dữ liệu nội bộ của kho); đọc quanh một tin; thành viên
  nhóm.
- Quản lý dữ liệu kiểu Zalo: dung lượng kho, file theo hội thoại, file lớn, xem nhanh, xóa file giữ tin; Cài đặt thành cửa sổ
  như Zalo PC; trang Hàng đợi làm lại gọn như Zalo.

## 2026-11-10 - 2026-11-12: hoàn thiện như Zalo PC

- Bình chọn nhóm hiện như Zalo PC (thẻ bình chọn, xem kết quả, chỉ xem); thẻ nhắc hẹn của nhóm.
- Gửi file qua kho theo thứ tự chùm ảnh, file khác, chữ sau cùng (tin chữ luôn đi SAU ảnh / file).
- MCP `list_threads` lọc hội thoại chưa trả lời; kết quả đọc nhắc cách trả lời trích dẫn bằng `reply_to`.
- Sticker gửi liền nhau xếp hàng như Zalo; thẻ link và viên cảm xúc như Zalo PC.
- Tìm email, link, số có dấu nối khớp cả cụm liền nhau; kết quả tìm ghép avatar thành viên cho nhóm không có ảnh.
- Xem / nghe file ngay trong kho (PDF, nhạc, video, ảnh, txt), báo trước file đã hết hạn; đọc file Word (.docx) ngay
  trong kho bằng `docx-preview` (dựng trong iframe sandbox, link chỉ giữ http / https / mailto).
- Thông báo thêm người vào nhóm nối tên bằng dấu phẩy, "và N người nữa", avatar ghép; thẻ đầu nhóm.
- Chùm ảnh / video gộp chung, tách khung khi có tin chen giữa; số cảm xúc của chùm đếm theo lần bấm.
- Chế độ trình chiếu: khi chia sẻ màn hình, danh sách chỉ còn các hội thoại chọn sẵn (chọn nhanh theo thẻ Phân loại của Zalo,
  đọc bằng getLabels - chỉ đọc), ẩn Hàng đợi và Tổng quan, thêm hội thoại bằng cách gõ từ 3 chữ, thoát phải xác nhận và
  quên danh sách.
- MCP hẹn giờ gửi ảnh / file (`send_file` có `send_date` + `send_time`): file ngoài kho được chép vào kho lúc hẹn.
- Hàng đợi: nút Gửi ngay cho tin lẻ đang hẹn giờ.

## 2026-11-13: gửi ảnh / file và định dạng tin nhắn trên dashboard

- Khung soạn tin có nút Gửi hình ảnh (chùm ảnh) và Đính kèm File (menu Chọn File / Chọn Thư mục như Zalo, thư mục gói thành
  một file .zip; thẻ file kể cả ảnh / video, qua cờ `asFile` của bản vá zca-js); file chọn, dán hay kéo thả đều nằm chờ trong
  khay dưới ô nhập ("N file", ô + để thêm, X để bỏ), Enter mới gửi; icon vẽ theo dáng icon của Zalo.
- Thanh Định dạng tin nhắn như Zalo (Ctrl+Shift+X): đậm, nghiêng, gạch chân, gạch ngang, cỡ chữ, màu chữ, bỏ định dạng, gạch
  đầu dòng, đánh số, thụt lề, hoàn tác, mở rộng ô soạn; bật thì dán giữ định dạng, tắt thì dán chữ trơn.
- Tin trong kho hiện thêm cỡ Rất lớn, danh sách gạch đầu dòng / đánh số và thụt lề; cỡ chữ đúng px của Zalo.
- Test Hàng đợi không còn phụ thuộc năm của máy.
- MCP: chữ gửi đi định dạng được bằng markdown + thẻ ngắn (đậm, nghiêng, gạch, màu, cỡ, danh sách, thụt lề); `send_file` có
  `as_file` gửi ảnh / video thành thẻ file; `read_thread` / `search_messages` hiện lại dấu danh sách cho tin có danh sách.
- Repo chuẩn bị public: gỡ dữ liệu thật khỏi toàn bộ lịch sử; luật "KHÔNG đưa dữ liệu thật vào repo" trong `CLAUDE.md`.
  Nhật ký thay đổi chi tiết chỉ giữ trên máy (`plans/`, không lên git).

## 2026-11-14: tra số điện thoại và nhắn người chưa kết bạn

- MCP `lookup_phones`: tra một danh sách số điện thoại trên Zalo như ô Tìm kiếm (daemon tra dần theo nhịp, trần ngày, khung giờ
  lô; mỗi số tra một lần rồi giữ kết quả), trả ai có Zalo (tên Zalo + mã hội thoại), ai không có; tự nghỉ khi Zalo trả mã lạ hoặc
  khi một chuỗi dài "không có Zalo" mà số mốc cũng không ra; `recheck` / `cancel`.
- `send_batch` gửi được tới người chưa kết bạn và định dạng chữ từng tin; luật cũ "lô chỉ bạn bè" bỏ.
- Gửi tới người chưa kết bạn hỏng chỉ hỏng tin đó; 3 người liền hỏng mới bật khóa khẩn cấp.
- Cài đặt: thêm mục Tra số điện thoại (tối đa mỗi ngày, nhịp ngắn nhất / dài nhất).
- Khoảng listener không nghe ghi rõ Zalo đã gửi bù đủ chưa: mỗi lượt lấy bù lưu kết quả (đủ / dừng dở kèm lý do / đăng nhập lại
  bằng QR); `sync_status` và thẻ "Khoảng mất kết nối" ở Tổng quan hiện "Đã lấy bù đủ", "Có thể thiếu tin" (kèm cách lấy lại)
  hay "Chưa rõ", kèm số tin kho có trong khoảng - không còn gọi chung mọi khoảng là "có thể thiếu".
- Máy thức mà kết nối không đứt thì kho vẫn chủ động xin Zalo gửi bù, để khoảng ngủ ngắn cũng có kết quả; lượt lấy bù dừng dở
  thì lần kết nối sau xin lại ngay. Đồng bộ từ điện thoại phủ trọn một khoảng thì khoảng đó hiện "Đã đồng bộ từ điện thoại";
  nhãn "Chưa rõ" chỉ cách làm cho chắc (đồng bộ điện thoại ngày đó).
