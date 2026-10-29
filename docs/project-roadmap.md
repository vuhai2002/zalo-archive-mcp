# Lộ trình

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| Xây kho | Code toàn bộ phần chắc ăn + khung phần chờ đo (`plans/261028-2253-xay-kho-truoc-chinh-sau/`) | xong (0.1.0) |
| Dashboard + gửi trực tiếp | dashboard web, Claude gửi ngay, tin lẻ tự do, lô có nhịp | xong (0.2.0) |
| Thiết lập trên dashboard | mật khẩu lần đầu, thêm / đổi nick bằng QR, giữ dữ liệu từng nick | xong (0.3.0) |
| Chạy thử nick phụ | login, chạy daemon, nhắn đủ loại tin, đối chiếu; tin tự gửi dội về, gửi mọi đường (lẻ, hẹn giờ, nhóm, lô, MCP), kill switch | xong (0.3.0); chưa đo: URL media sống bao lâu |
| Đắp phần khung | lấy bù tin lỡ nhiều trang, cảm xúc + sự kiện nhóm vào DB, xin lại link media (renewlink + link trả sau qua WS) | xong (0.4.0); keepAlive vẫn tắt, chờ đo phiên QR sống bao lâu |
| Lịch sử cũ | đồng bộ từ điện thoại (port deplao, MIT) | xong (0.4.0), mới thử trên nick phụ (không có tin cũ) |
| Nick chính, chỉ đọc | `.env.production.example`, chạy 2 tuần không thủng vô cớ | chưa |
| Gửi trên nick chính | tin lẻ trước, lô với trần thấp rồi nâng dần (Cài đặt trên dashboard) | chưa |
