<p align="center">
  <img src="web/public/app-logo.png" alt="Zalo Archive MCP" width="160" />
</p>

<h1 align="center">Zalo Archive MCP</h1>

<p align="center">
Kho lưu trữ <strong>toàn bộ tin nhắn + file</strong> của tài khoản Zalo <strong>cá nhân</strong> (gửi và nhận, 1-1 và nhóm),<br/>
có dashboard web như Zalo PC để xem, tìm, gửi, và mở cho <strong>Claude</strong> đọc + gửi tin qua <strong>MCP</strong>.<br/>
Chạy trên máy của bạn, dữ liệu không rời khỏi máy. Không phải chatbot tự trả lời người khác.
</p>

<p align="center">
  <a href="#cài-bằng-ai-agent">Cài bằng AI agent</a> •
  <a href="#cài-đặt">Cài đặt</a> •
  <a href="#gắn-vào-claude-dùng-ở-mọi-phiên">Gắn vào Claude</a> •
  <a href="#lưu-ý-bảo-mật">Bảo mật</a> •
  <a href="docs/system-architecture.md">Kiến trúc</a> •
  <a href="#tác-giả">Tác giả</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node-22.13+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/SQLite-node:sqlite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/MCP-Claude-D97757?style=flat-square&logo=anthropic&logoColor=white" alt="MCP" />
  <img src="https://img.shields.io/badge/tests-669%20xanh-brightgreen?style=flat-square" alt="tests" />
</p>

---

Dữ liệu nằm hết trong `data/` (mỗi nick một thư mục `data/accounts/<nick>/`) và không bao giờ được commit.

## Cài bằng AI agent

Dùng Claude Code (dòng lệnh `claude` hoặc tab Code của ứng dụng Claude) trên Windows: mở ở thư mục muốn đặt repo, dán
nguyên đoạn dưới đây.

```text
Clone https://github.com/vuhai2002/zalo-archive-mcp về thư mục hiện tại và cài theo đúng hướng dẫn trong README.md
của repo đó (mục "Cài đặt" và "Gắn vào Claude").
- Đăng ký MCP "zalo-archive" ở phạm vi user (global) cho Claude Code, dùng đường dẫn thật của repo vừa clone,
  rồi kiểm tra bằng `claude mcp get zalo-archive`.
- Bật tự chạy daemon khi khởi động máy: `pnpm autostart install`.
- Thiếu gì (Git, Node >= 22.13, pnpm qua `corepack enable`...) thì tự cài thêm.
- Không tự đặt mật khẩu dashboard và không đăng nhập Zalo thay tôi.
Cài xong thì hướng dẫn tôi ngắn gọn từng bước tôi cần tự làm (theo mục "Việc bạn tự làm sau khi cài").
```

### Việc bạn tự làm sau khi cài

1. Mở http://127.0.0.1:3210, tạo mật khẩu dashboard (nhập hai lần).
2. Bấm **Đăng nhập bằng QR**, quét bằng app Zalo trên điện thoại. Từ đây kho tự lưu mọi tin mới.
3. Muốn có tin cũ: Cài đặt > **Đồng bộ và sao lưu** > **Đồng bộ từ điện thoại**, rồi xác nhận trên điện thoại.
4. Có Zalo PC trên máy: cùng mục đó, bấm nút thư mục để chọn thư mục Zalo PC lưu file, rồi bấm **Lấy từ Zalo PC**.
5. Mở phiên Claude mới, hỏi thử: "Có tin nào tôi chưa trả lời không?".

## Cài đặt

Cần Git, Node >= 22.13 và pnpm 11 (`corepack enable`).

```bash
git clone https://github.com/vuhai2002/zalo-archive-mcp.git
```

```bash
cd zalo-archive-mcp
```

```bash
pnpm install
```

```bash
pnpm build:web
```

Không cần tạo hay sửa `.env`: khóa mã hóa tự sinh ở lần chạy đầu (`data/app-secrets.json`), mật khẩu
tạo trên dashboard. `.env.example` chỉ để chỉnh các núm vận hành nếu muốn.

## Chạy

```bash
pnpm start
```

Mở http://127.0.0.1:3210:

1. Lần đầu: tạo mật khẩu dashboard (nhập hai lần). Các lần sau đăng nhập bằng mật khẩu đó.
2. Chưa có nick nào thì dashboard tự mở trang **Tài khoản Zalo**: bấm **Đăng nhập bằng QR**, quét bằng app Zalo trên
   điện thoại. Có nick rồi thì vào kho là thấy trang tin nhắn; Tài khoản Zalo nằm trong cửa sổ Cài đặt (bấm avatar hoặc
   bánh răng -> Thông tin tài khoản).

Từ đó daemon tự lưu mọi tin; lần sau `pnpm start` tự đăng nhập lại bằng cookie đã lưu (mã hóa).

**Nhiều nick:** mỗi lúc chỉ MỘT nick nghe tin. Cài đặt > Tài khoản Zalo có danh sách các nick đã đăng
nhập, nút **Chuyển sang** và **Thêm nick khác**. Đổi nick không xóa gì: dữ liệu từng nick giữ riêng,
quay lại nick cũ thì nối tiếp. Tin đến trong lúc một nick không chạy được Zalo gửi bù khi nick đó
chạy lại, nhưng chỉ khoảng 2 tuần gần nhất. Mỗi lần đăng nhập Zalo cách nhau tối thiểu 30 giây để
không bị coi là máy.

**Chỉ đọc:** nick mới thêm luôn bắt đầu ở chế độ **Chỉ đọc** - kho nghe + lưu tin bình thường nhưng
không soạn, không gửi gì qua nick đó (MCP, dashboard và daemon đều chặn; khung chat không có ô soạn
tin). Muốn gửi thì bấm **Mở gửi tin** ở danh sách nick và xác nhận. Nick mượn, nick đang thử: để
Chỉ đọc.

**Máy ngủ / gập máy:** kho đứng im theo máy, thức dậy thì tự nối lại và Zalo gửi bù tin trong lúc ngủ
(khoảng 2 tuần gần nhất). Tổng quan ghi khoảng đó là "máy ngủ" để biết kho đã không nghe lúc nào.

**Tự chạy khi mở máy (Windows):** `pnpm autostart install` đặt một file vào thư mục Startup của bạn,
mỗi lần đăng nhập Windows daemon tự chạy ẩn (không cửa sổ), log ở `data/logs/daemon.log`. Xem trạng thái:
`pnpm autostart status`. Dừng: `pnpm stop`. Gỡ tự chạy: `pnpm autostart uninstall`.

Quên mật khẩu dashboard: `pnpm reset-password` rồi tải lại trang để tạo mật khẩu mới (không đụng
tới nick Zalo hay tin nhắn).

Dashboard mở vào trang Hội thoại như Zalo (đọc tin cũ, xem ảnh/file, gửi
ngay / hẹn giờ / lưu nháp; nút Gửi hình ảnh (chùm ảnh) và Đính kèm File (menu Chọn File / Chọn Thư mục - thư mục gói thành
một file .zip; gửi thành thẻ file, kể cả ảnh); file chọn, dán hay kéo thả vào ô soạn đều nằm chờ trong khay dưới ô nhập (bỏ /
thêm được), Enter mới gửi; nút Định dạng tin nhắn (Ctrl+Shift+X) bật thanh đậm,
nghiêng, gạch, cỡ chữ, màu, gạch đầu dòng, đánh số, thụt lề như Zalo - bật thì dán giữ định dạng, tắt thì dán chữ trơn;
rê chuột vào tin có Trả lời, Chia sẻ tới tối đa 100 hội thoại, Copy, Chọn nhiều tin
nhắn, Xóa khỏi kho, nút Thích + thanh 6 cảm xúc để thả cảm xúc; gõ tin là gửi ngay, tin hiện liền trong khung chat; tìm kiếm không phân biệt dấu ngay trong cột trái).
Thanh bên trái: avatar nick (chấm màu = trạng thái nghe tin, bấm mở Tài khoản Zalo), Hội thoại, Hàng đợi gửi, nút
Trình chiếu; dưới cùng Tổng quan (thống kê, khoảng mất kết nối, ở `/overview`) và nút bánh răng.

Chia sẻ màn hình (thuyết trình, họp online...): bấm nút Trình chiếu, chọn sẵn các hội thoại sẽ dùng (tích từng cái, hoặc bấm một thẻ Phân
loại đã gắn trên Zalo để chọn cả thẻ), rồi Bắt đầu trình chiếu - CHỌN XONG rồi mới chia sẻ màn hình. Lúc trình chiếu danh
sách chỉ còn các hội thoại đó, Hàng đợi và Tổng quan ẩn, hộp Chia sẻ chỉ tới các hội thoại đó; gặp người bất ngờ thì gõ
từ 3 chữ ở ô tìm để thêm (chỉ hiện tên). Bấm nút đỏ hoặc Thoát rồi xác nhận để về như cũ; thoát là quên danh sách, lần
sau chọn lại từ đầu.

Nút bánh răng mở menu như Zalo PC: Thông tin tài khoản, Cài đặt, Dữ liệu (Đồng bộ và sao lưu, Quản lý dữ
liệu), Giao diện (Sáng / Tối / Theo hệ thống), Đăng xuất. Cài đặt là **cửa sổ mở đè lên trang đang xem** (không đổi trang;
Esc, nút X hoặc bấm ra nền để đóng), menu trái: Tài khoản Zalo (nick đang dùng, Dừng / Đăng xuất Zalo, danh sách nick,
thêm nick bằng QR), Gửi tin và giới hạn, Khóa khẩn cấp, Đồng bộ và sao lưu (lịch sử cũ từ điện thoại, lấy media từ
Zalo PC), Quản lý dữ liệu, Giao diện. Link cũ `/settings/...` và `/zalo` vẫn mở đúng mục trong cửa sổ. Quản lý dữ liệu: tổng dung lượng kho +
thanh ổ đĩa, ảnh / video / file theo hội thoại (xếp theo dung lượng), file lớn hơn 5 MB, tin nhắn, bản sao DB cũ; lưới file như
Zalo điện thoại (tab Ảnh / Video / File / Tin nhắn thoại) để Mở, Xem tin gốc, Lưu về máy, Xóa. Xóa ở đây là **xóa file, giữ
tin** (như "Xóa dữ liệu" của Zalo): tin vẫn còn, chỗ file hiện "Đã xóa file khỏi kho", kho không tải lại; file dùng chung với
tin khác thì ghi rõ và chỉ giải phóng ổ khi không còn tin nào dùng.

Xóa tin: "Xóa khỏi kho" chỉ xóa trong kho (Zalo vẫn còn), xóa luôn file ảnh / video / file không tin nào khác dùng để
giải phóng ổ, và đồng bộ sau này không lấy lại tin đó. Ngược lại, tin hay file bạn xóa trên điện thoại / Zalo PC thì kho
vẫn giữ - trừ My Documents: xóa ở đó trên Zalo thì kho xóa theo.

Chưa có nick để thử? Xem giao diện với dữ liệu giả:

```bash
pnpm seed-demo
```

rồi `pnpm start`, vào Cài đặt > **Tài khoản Zalo** và chuyển sang nick "demo".

Thử trên NICK PHỤ trước khi dùng nick chính. Mỗi thư mục `data/` chỉ một daemon (có khóa chống chạy
trùng), và KHÔNG chạy daemon này cùng zalo-agent trên cùng một tài khoản.

## Gắn vào Claude (dùng ở mọi phiên)

Thay `C:/duong-dan/zalo-archive-mcp` bằng đường dẫn thật tới thư mục repo trên máy bạn (trên Windows viết dấu `/` cho
gọn). Không cần biến môi trường nào: MCP tự tìm thư mục dữ liệu `data/` theo vị trí repo, dù Claude mở nó từ thư mục nào.

**Claude Code** (dòng lệnh `claude` và tab Code của ứng dụng Claude): cài ở phạm vi `user` để MỌI phiên, ở mọi thư mục, đều
hỏi được kho. Thiếu `--scope user` thì MCP chỉ có trong đúng thư mục đã chạy lệnh.

```bash
claude mcp add --scope user zalo-archive -- node C:/duong-dan/zalo-archive-mcp/node_modules/tsx/dist/cli.mjs --disable-warning=ExperimentalWarning C:/duong-dan/zalo-archive-mcp/src/bin/run-mcp-stdio-server.ts
```

Kiểm tra: `claude mcp get zalo-archive` phải ghi `Scope: User config` và `Status: ✔ Connected`. Gỡ: `claude mcp remove
zalo-archive -s user`.

**Ứng dụng Claude Desktop** (tab chat thường): mở Settings -> Developer -> Edit Config (file `claude_desktop_config.json`,
trên Windows ở `%APPDATA%\Claude\`, trên macOS ở `~/Library/Application Support/Claude/`), thêm vào `mcpServers` rồi thoát hẳn
và mở lại ứng dụng:

```json
{
  "mcpServers": {
    "zalo-archive": {
      "command": "node",
      "args": [
        "C:/duong-dan/zalo-archive-mcp/node_modules/tsx/dist/cli.mjs",
        "--disable-warning=ExperimentalWarning",
        "C:/duong-dan/zalo-archive-mcp/src/bin/run-mcp-stdio-server.ts"
      ]
    }
  }
}
```

File đã có `mcpServers` cho MCP khác thì chỉ thêm khóa `"zalo-archive"` vào trong đó, không tạo `mcpServers` thứ hai.

Lưu ý:
- MCP chạy thẳng code trong repo: `git pull` / sửa code xong thì nối lại MCP (Claude Code: lệnh `/mcp` -> Reconnect, hoặc mở
  phiên mới; Claude Desktop: mở lại ứng dụng) để Claude dùng bản mới.
- Đọc / tìm tin chỉ cần đã có kho. GỬI tin cần daemon đang chạy và đã đăng nhập Zalo (`pnpm start` hoặc tự chạy khi đăng
  nhập Windows): MCP chỉ ghi vào hàng đợi, daemon mới gửi.
- Cần Node >= 22.13 trong `PATH` (lệnh `node` chạy được ở terminal bất kỳ).

| Nhóm | Tool | Việc |
|---|---|---|
| Đọc | `list_threads`, `read_thread`, `search_messages`, `get_attachment`, `list_group_members`, `sync_status` | đọc (lùi / tới / quanh một tin), tìm (chữ, người gửi, tên file, ngày), xem file, thành viên nhóm, kho phủ tới đâu; tin có danh sách hiện lại "- " / "1. " và thụt lề để Claude đọc đúng cấu trúc |
| Đọc | `list_threads` với `unreplied_only` | hội thoại đang chờ bạn trả lời ("có tin nào tôi chưa rep"): 1-1 có tin cuối của người kia, nhóm có tin nhắc tên / trả lời bạn mà bạn chưa đáp; mặc định 14 ngày qua, đổi bằng `from_date`. Kho không biết bạn đã đọc tin trên điện thoại chưa, nên nhắn lại, nghe máy hoặc thả cảm xúc mới tính là đã trả lời |
| Gửi | `send_message` | gửi ngay một tin, chờ tới khi gửi xong rồi báo kết quả; trong nhóm nhắc tên (@) được bằng `mentions`; trả lời (trích dẫn) một tin bằng `reply_to` = số tin #N ở `read_thread`; chữ định dạng được như thanh của Zalo bằng `**đậm**`, `*nghiêng*`, `~~gạch~~`, `<u>gạch chân</u>`, `<red>` / `<orange>` / `<yellow>` / `<green>`, `<small>` / `<big>` / `<huge>`, dòng `- ` / `1. ` (cũng dùng được cho `schedule_message`, `draft_message`, chữ của `send_file`) |
| Gửi | `schedule_message` | hẹn giờ một tin chữ (hẹn kèm ảnh / file: `send_file` có `send_date` + `send_time`) |
| Gửi | `lookup_phones` | tra danh sách số điện thoại trên Zalo (như ô Tìm kiếm) để nhắn người chưa kết bạn: kho tra dần theo nhịp, tối đa 100 số/ngày; gọi lại để xem ai có Zalo (tên Zalo + `thread_id`), ai không có; `recheck` tra lại, `cancel` bỏ số đang chờ |
| Gửi | `send_batch` | gửi nhiều người, mỗi người một nội dung riêng (định dạng được), tới bạn bè lẫn người chưa kết bạn đã có trong kho, có nhịp |
| Gửi | `draft_message`, `list_outbox`, `cancel_outbox` | nháp để duyệt trên dashboard, xem / hủy hàng đợi |
| Gửi | `send_file` | gửi file / ảnh / video (kèm chữ) - chỉ khi bạn bảo; nhiều ảnh một lần thành một chùm như Zalo, `as_file: true` thì mọi file (kể cả ảnh / video) đi thành thẻ file như nút Đính kèm File; chữ luôn gửi SAU ảnh / file; Claude liệt kê người nhận + file + chữ, ứng dụng hỏi bạn duyệt mỗi lần; thêm `send_date` + `send_time` là hẹn giờ (kho chép file vào `outbox-files/` của nick ngay lúc hẹn, daemon tự gửi đúng giờ); file bí mật (.env, khóa, mật khẩu) và dữ liệu nội bộ của kho bị chặn |
| Gửi | `react_to_message` | thả cảm xúc (👍 ❤️ 😆 😮 😭 😡) vào một tin, số tin #N ở `read_thread` - chỉ khi bạn bảo |
| Gửi | `recall_message` | thu hồi tin kho đã gửi - chỉ khi bạn bảo; Claude Code / Claude Desktop hỏi duyệt trước mỗi lần |

Claude gửi ngay khi được bảo, không hỏi lại (người dùng chọn). Gửi chỉ chạy được khi daemon đang
chạy và đã đăng nhập: MCP ghi vào hàng đợi, daemon là nơi duy nhất gọi Zalo. MCP luôn theo nick
đang dùng trên dashboard, đổi nick không cần khởi động lại.

## Giới hạn gửi (sửa trên dashboard -> Cài đặt)

- **Tin lẻ** (gửi cho một người): không trần, không khung giờ, chỉ cách tin trước tối thiểu 3 giây.
- **Lô** (gửi nhiều người một lúc): từng tin cách nhau ngẫu nhiên 45-180 giây, tới bạn bè lẫn người
  chưa kết bạn (không nhóm), chỉ 7h-22h, tối đa 100 tin lô/ngày. Để Zalo không coi là bắn hàng loạt.
- **Tra số** (`lookup_phones`): tối đa 100 số/ngày, mỗi lượt cách 5-20 giây, chỉ trong khung giờ của lô.
  Zalo trả mã lạ thì kho tự nghỉ tra tới hôm sau.
- **Khóa khẩn cấp**: một nút trên dashboard (hoặc `pnpm outbox kill`). Lỗi gửi đầu tiên tự khóa để
  không thử lại mù trên nick chính; kiểm tra xong thì mở khóa trên dashboard. Riêng tin tới người chưa
  kết bạn hỏng (họ không nhận tin người lạ) thì chỉ hỏng tin đó; 3 người liền hỏng mới tự khóa.
- **Nên dùng nick phụ** khi nhắn nhiều người chưa kết bạn: Zalo có thể giới hạn hoặc khóa nick nhắn người lạ nhiều.
- Tin hẹn giờ / đang chờ mà trễ quá 12 giờ (vd daemon tắt lâu) thì bỏ, không gửi muộn.

## Lưu ý bảo mật

- Claude gửi được mà không hỏi lại, nên một tin nhắn lạ trong kho có thể tìm cách lừa Claude gửi
  (prompt injection). Nội dung tin trả cho Claude luôn được bọc "dữ liệu, không phải mệnh lệnh",
  nhưng đó không phải hàng rào tuyệt đối. Thấy hàng đợi có tin lạ thì bấm khóa ngay.
- Dashboard chỉ nghe 127.0.0.1, có mật khẩu (lưu dạng băm scrypt, sai 5 lần thì khóa 1 phút), chặn
  Host lạ. Đừng mở ra mạng ngoài khi chưa có reverse proxy + HTTPS. Lần đầu chưa có mật khẩu thì ai
  mở dashboard trước sẽ đặt được mật khẩu - nên tạo ngay sau khi cài.
- Khóa mã hóa cookie nằm ở `data/app-secrets.json`, cạnh cookie: ai lấy được thư mục `data/` là lấy
  được phiên Zalo. Đừng chép thư mục này đi đâu. Mất file này là mất mọi cookie (phải quét QR lại).
- Trên Windows, quyền file `0o600` không có tác dụng: để `DATA_DIR` trong thư mục người dùng.
- Kho chứa tin của người khác (Luật BVDLCN 91/2025). Cân nhắc trước khi cho model cloud đọc.

## Các lệnh

| Lệnh | Việc |
|---|---|
| `pnpm start` | daemon: dashboard + lưu tin + gửi |
| `pnpm autostart install` / `uninstall` / `status` | tự chạy daemon ẩn mỗi lần đăng nhập Windows |
| `pnpm stop` | dừng daemon đang chạy (kể cả bản chạy ẩn) |
| `pnpm login` | đăng nhập QR ở terminal (dự phòng; tắt daemon trước) |
| `pnpm reset-password` | quên mật khẩu dashboard: xóa để tạo lại trên dashboard |
| `pnpm mcp` | MCP server (thường để Claude tự gọi) |
| `pnpm outbox` | hàng đợi ở terminal: list, approve, cancel, kill, unkill, status |
| `pnpm replay-journal` | dựng lại kho từ nhật ký thô sau khi sửa parser |
| `pnpm seed-demo` | tạo kho demo dữ liệu giả |
| `pnpm build:web`, `pnpm dev:web` | build / chạy dev giao diện |
| `pnpm test`, `pnpm typecheck` | kiểm tra |

## Còn đang thử

- `ZALO_KEEPALIVE_MINUTES` (mặc định 0 = tắt): gọi keepAlive định kỳ, chờ số đo trên nick phụ.

Các phần trước đây còn là khung (lấy bù nhiều trang, xin lại link media hết hạn, đồng bộ từ điện thoại, cảm xúc và sự kiện
nhóm) đã làm xong - xem [changelog](docs/project-changelog.md).

## Tác giả

**Vũ Văn Hải (haivv)** - [github.com/vuhai2002](https://github.com/vuhai2002)

Xây trên [zca-js](https://github.com/RFS-ADRENO/zca-js) (MIT) và
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (MIT).

## License

[MIT](LICENSE) © 2026 Vũ Văn Hải (haivv)
