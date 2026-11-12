# CLAUDE.md - zalo-archive-mcp

Kho lưu trữ TOÀN BỘ tin nhắn + file của tài khoản Zalo CÁ NHÂN CHÍNH của người dùng
(gửi và nhận, DM và nhóm), mở cho Claude / AI agent đọc qua MCP, và cho agent SOẠN tin
để gửi thay người dùng: gửi từng người, hẹn giờ, gửi nhiều người có nhịp như người thật.
KHÔNG phải chatbot tự trả lời (việc đó là của dự án anh em `..\zalo-agent`).

**Trạng thái (2026-10-29): đã chạy trên nick phụ (v0.4.0: cảm xúc, lấy bù nhiều trang, đồng bộ từ điện
thoại, xin lại link media). Thiết lập hoàn toàn trên dashboard (mật khẩu
lần đầu, thêm / đổi nick bằng QR), không cần `.env`: `plans/261029-1134-thiet-lap-tren-dashboard-va-doi-nick/plan.md`.
Trước đó: `plans/261028-2253-xay-kho-truoc-chinh-sau/plan.md`.**

## Đọc trước khi làm bất cứ gì

1. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/handoff-tu-session-zalo-agent.md`
   - toàn bộ yêu cầu gốc của người dùng, những gì đã hiểu, đã quyết, còn treo.
2. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/kho-tin-nhan-zalo-cho-ai-report.md`
   - báo cáo tổng hợp có link nguồn.
3. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/reports/*.md` - notes gốc, tra khi
   cần chi tiết hoặc trích dòng code zca-js.

ĐỪNG research lại những gì đã có trong các file trên. Chỉ research thêm khi gặp câu hỏi
nằm trong mục "Câu hỏi còn mở" hoặc có bằng chứng mới.

`plans/` chỉ có trên máy người dùng (đã `.gitignore`, gỡ khỏi lịch sử git 2026-11-12): ghi chép nội bộ, có yêu cầu riêng
của người dùng. Đọc thoải mái, KHÔNG chép nội dung riêng trong đó sang file được git theo dõi.

## KHÔNG đưa dữ liệu thật vào repo (người dùng chốt 2026-11-12)

Repo này sẽ PUBLIC trên GitHub. Lịch sử 80 commit đầu đã phải viết lại để gỡ tên người, nhóm, id, số điện thoại, email,
link và nội dung tin thật bị chép vào test / chú thích / changelog / lời commit. KHÔNG được lặp lại.

Mọi thứ đến từ kho Zalo thật (DB trong `data/`, ảnh chụp màn hình người dùng gửi, kết quả MCP / dashboard, log daemon,
thư mục Zalo PC, `plans/`) chỉ dùng để HIỂU lỗi. Không bao giờ chép vào code, chú thích, test, fixture, dữ liệu demo,
`docs/`, `README.md`, changelog, `CLAUDE.md`, lời commit, tên nhánh, mô tả PR. Cụ thể là cấm:

- tên người, tên gợi nhớ, tên danh bạ điện thoại, tên nhóm, tên thẻ Phân loại thật (kể cả tên của chính người dùng);
- id Zalo thật: uid, id nhóm / hội thoại, id tin, cliMsgId, topicId, id thẻ... (dãy 15-20 chữ số lấy từ kho);
- số điện thoại, email, tên miền / tên công ty, tổ chức, nơi chốn người dùng sinh hoạt;
- link thật: ảnh / file / avatar / QR trên CDN Zalo có id thật, Google Form, bài Facebook, tài liệu...;
- nội dung thật: chữ trong tin, câu hỏi bình chọn, lời nhắc hẹn, tên file, đoạn trích; số liệu riêng của kho;
- đường dẫn có tên tài khoản Windows hay thư mục dữ liệu riêng của người dùng.

Cách làm đúng:

- Tái hiện lỗi từ dữ liệu thật thì dựng ví dụ GIẢ cùng cấu trúc: tên giả rõ ràng (Lan, Minh, "Nhóm Thử Nghiệm"), id dạng `u-lan`,
  `g-1` hoặc `1000000000000000001`, số `0900000000`, email / tên miền `example.com`, link kiểu `https://f1.zdn.vn/a.jpg`,
  nội dung tin tự viết ("Hẹn họp lúc 9h nhé").
- Tên giả từ hai chữ trở lên phải kiểm KHÔNG trùng tên nào trong kho: truy vấn chỉ đọc `contacts.display_name`,
  `contacts.alias`, `threads.name` của DB nick đang dùng. Test có tính độ dài chữ (vị trí nhắc tên, đoạn trích) thì tên
  giả giữ đúng độ dài và không trùng chữ khác trong câu thử.
- Changelog, tài liệu, lời commit mô tả theo HÀNH VI ("thông báo nhóm nối tên bằng dấu phẩy, quá 3 người thì ..."), không
  kể ví dụ đời thật ("tin trong nhóm X của chị Y lúc 9h"). Kết quả thử thật ghi chung chung ("gửi đúng giờ, đúng thứ tự").
- Trước MỖI commit: rà `git diff --cached` và lời commit tìm tên người / nhóm thật, dãy 15-20 chữ số, số điện thoại, email,
  link CDN có id thật, câu tin trích nguyên văn. Còn thì thay rồi mới commit; nghi ngờ thì hỏi người dùng.
- Tác giả commit (tên + email trong git config) là thông tin thật của người dùng, đó là CHỦ ĐÍCH - không đề xuất đổi.

## Repo tham khảo (chỉ đọc, KHÔNG sửa)

- `..\zalo-agent` - dự án anh em, đã chạy production. Nguồn code tái dụng
  chính (listener, login QR, credential mã hóa, scheduler, trần gửi, chặn SSRF...). Bản
  đồ file ở mục 7 của file handoff.
- `..\zalo-agent-references\zca-js` - source lib. **Trước khi viết code đụng
  zca-js, grep `src/apis/` để xác nhận chữ ký hàm thật, không đoán.**
- `..\zalo-agent-references\zalo-agent-cli`, `zalo-personal`, `deplao-builder`.

## Ràng buộc bắt buộc

- **Claude GỬI ĐƯỢC NGAY khi người dùng bảo** (người dùng chốt 2026-10-28, đã được báo rủi ro
  prompt injection). Mọi lệnh gửi vẫn đi qua hàng đợi + cổng ở MÁY CHỦ (daemon), không gọi
  zca-js từ MCP. Tin lẻ: không trần, không khung giờ, chỉ cách nhau vài giây. Gửi nhiều người
  (lô): từng tin, nhịp ngẫu nhiên, chỉ bạn bè, khung giờ + trần ngày riêng cho lô. Kill switch
  luôn có hiệu lực; lỗi gửi đầu tiên tự bật. Số chỉnh trên dashboard (Cài đặt).
- **Tin chữ luôn gửi SAU ảnh / file** (người dùng chốt 2026-11-10). Gửi chữ kèm file: một lệnh `send_file` có `text`, không
  gọi `send_message` trước. Daemon gửi theo thứ tự: chùm ảnh (mọi ảnh trong một lần, Zalo hiện thành một chùm), rồi file khác,
  rồi tin chữ (`sendFilesThenText` trong `src/outbox/outbox-zalo-attachments.ts`) - không để chữ thành chú thích ảnh.
- **Không tool chuyển tiền / thanh toán / VietQR** (`zalo-agent-cli` có sẵn - không harvest).
- **Không gửi kiểu campaign / bắn hàng loạt.** "Gửi nhiều người" = hàng đợi gửi TỪNG tin,
  nội dung riêng từng người, nhịp ngẫu nhiên, chỉ tới bạn bè. Ngoại lệ người dùng chốt 2026-11-09: nút Chia sẻ
  (chuyển tiếp) trên DASHBOARD, như Zalo, tối đa 100 hội thoại mỗi lần, cả nhóm; không mở cho MCP.
- **Xóa tin:** "Xóa khỏi kho" trên dashboard xóa hẳn tin + file không ai dùng, ghi nhớ mã tin để đồng bộ sau không
  lấy lại (người dùng chốt 2026-11-09). Xóa trên Zalo (điện thoại / PC) thì kho GIỮ, trừ My Documents (xóa theo).
  Không mở lệnh xóa cho MCP.
- **Không tự gửi lời mời kết bạn, tra số điện thoại, thêm người vào nhóm** - đây là các
  thao tác Zalo bóp mạnh nhất (xem report).
- **Mọi thử nghiệm rủi ro chạy trên NICK PHỤ trước** (pha 0), rồi mới lên nick chính.
- **1 listener/account.** Không chạy app này và zalo-agent trên CÙNG một tài khoản.
- **Dữ liệu Zalo PC trên máy: được ĐỌC và lấy về kho, tuyệt đối KHÔNG sửa** (người dùng chốt
  2026-11-01). Không ghi, đổi tên, xóa, di chuyển, khóa file nào trong thư mục của Zalo PC
  (`%LOCALAPPDATA%\ZaloPC\<UID>\ZaloDownloads`, `%APPDATA%\ZaloData`); chỉ mở để đọc rồi chép
  sang kho. Media Zalo PC đã tải (ảnh, video, file thường) là file thường, ghép với tin theo tên
  file - đây là đường lấy lại media mà Zalo đã xóa khỏi máy chủ.
- **Không giải mã** DB Zalo PC (SQLCipher + XOR) và không gỡ lớp "nhiễu" của file trong
  `fileNoise` - vượt lớp bảo vệ của ứng dụng, chỉ làm khi người dùng bảo rõ. Backfill lịch sử tin
  nếu làm thì qua cổng debug của Zalo PC (kiểu ZaloBackup), một lần, có hỏi người dùng trước.
- Không commit `data/`, `.env`, cookie/credential, file media, DB.

## Quy ước

- Theo `~/.claude/CLAUDE.md` + `~/.claude/rules/*` (global): pnpm v11 + `minimumReleaseAge`,
  file < 200 dòng, kebab-case, dấu câu ASCII nhưng GIỮ dấu tiếng Việt, hỏi trước khi commit.
- Chạy test: sửa file nào chạy đúng file test đó; full suite một lần ở cuối; không tự sinh
  tiến trình đốt CPU.
- Stack: Node >= 22.13 + TypeScript (chạy bằng tsx, không build), pnpm 11, `zca-js` 2.2.0
  qua npm + `pnpm patch` (cmd 551), `node:sqlite`, `@modelcontextprotocol/sdk`, zod, pino, luxon.
- Chạy một file test: `node --disable-warning=ExperimentalWarning --import tsx --test <file>`.
- `node:sqlite` từ chối tham số đặt tên THỪA: mỗi `.run/.get/.all` chỉ truyền đúng tham số SQL dùng.
- Log luôn ra stderr (MCP stdio dùng stdout làm kênh giao thức).

## Cấu trúc

Bản đồ thư mục: `docs/codebase-summary.md`. Luồng dữ liệu + quyết định: `docs/system-architecture.md`.
Hướng dẫn chạy cho người dùng: `README.md`.
