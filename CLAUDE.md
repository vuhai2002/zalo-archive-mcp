# CLAUDE.md - zalo-archive-mcp

Kho lưu trữ TOÀN BỘ tin nhắn + file của tài khoản Zalo CÁ NHÂN CHÍNH của người dùng
(gửi và nhận, DM và nhóm), mở cho Claude / AI agent đọc qua MCP, và cho agent SOẠN tin
để gửi thay người dùng: gửi từng người, hẹn giờ, gửi nhiều người có nhịp như người thật.
KHÔNG phải chatbot tự trả lời (việc đó là của dự án anh em `..\zalo-agent`).

**Trạng thái (2026-10-28): đang xây kho theo `plans/261028-2253-xay-kho-truoc-chinh-sau/plan.md`
(code trước, chạy thử trên nick phụ khi người dùng có nick, rồi chỉnh). Chưa chạy với Zalo thật.
Đã có dashboard web + gửi trực tiếp: `plans/261028-2253-xay-kho-truoc-chinh-sau/phase-dashboard-va-gui-truc-tiep.md`.**

## Đọc trước khi làm bất cứ gì

1. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/handoff-tu-session-zalo-agent.md`
   - toàn bộ yêu cầu gốc của người dùng, những gì đã hiểu, đã quyết, còn treo.
2. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/kho-tin-nhan-zalo-cho-ai-report.md`
   - báo cáo tổng hợp có link nguồn.
3. `plans/261028-1915-research-kho-tin-nhan-zalo-cho-ai/reports/*.md` - notes gốc, tra khi
   cần chi tiết hoặc trích dòng code zca-js.

ĐỪNG research lại những gì đã có trong các file trên. Chỉ research thêm khi gặp câu hỏi
nằm trong mục "Câu hỏi còn mở" hoặc có bằng chứng mới.

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
- **Không tool chuyển tiền / thanh toán / VietQR** (`zalo-agent-cli` có sẵn - không harvest).
- **Không gửi kiểu campaign / bắn hàng loạt.** "Gửi nhiều người" = hàng đợi gửi TỪNG tin,
  nội dung riêng từng người, nhịp ngẫu nhiên, chỉ tới bạn bè.
- **Không tự gửi lời mời kết bạn, tra số điện thoại, thêm người vào nhóm** - đây là các
  thao tác Zalo bóp mạnh nhất (xem report).
- **Mọi thử nghiệm rủi ro chạy trên NICK PHỤ trước** (pha 0), rồi mới lên nick chính.
- **1 listener/account.** Không chạy app này và zalo-agent trên CÙNG một tài khoản.
- **Không đọc / giải mã DB Zalo PC** (SQLCipher + XOR). Backfill lịch sử cũ nếu làm thì qua
  cổng debug của Zalo PC (kiểu ZaloBackup), một lần, có hỏi người dùng trước.
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
