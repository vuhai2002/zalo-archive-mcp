// Tạo kho DEMO (dữ liệu giả) để xem dashboard khi chưa có nick Zalo nào.
// LUÔN ghi vào data/accounts/demo, không bao giờ đụng account thật.
// Cách dùng: pnpm seed-demo   rồi mở dashboard, vào Tài khoản Zalo, chuyển sang nick "demo"
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadOrImportAccountRegistry } from "../accounts/load-or-import-account-registry.js";
import { writeAccountRegistry } from "../accounts/zalo-account-registry.js";
import { accountPaths, resolveDataDir } from "../config/account-paths.js";
import { getEnv } from "../config/env.js";
import type { AttachmentDescriptor, NormalizedMessage } from "../archive/archived-message-types.js";
import { claimNextAttachment, markAttachmentDone } from "../storage/attachment-queue-store.js";
import { recordConnectionEvent } from "../storage/connection-event-store.js";
import { recordRecall, upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { enqueueOutboxItem } from "../storage/outbox-store.js";
import { replaceFriendDirectory, setMeta, upsertGroupNames } from "../storage/thread-directory-store.js";
import { removePathSync } from "../shared/remove-path-sync.js";

// Lấy DATA_DIR, múi giờ... từ .env nếu có; nick luôn là "demo"
const env = getEnv();
const dataDir = resolveDataDir(env);
const paths = accountPaths(dataDir, "demo");
// Chỉ xóa thư mục do CHÍNH lệnh này tạo (có file đánh dấu). Ai đó lỡ đăng nhập nick thật
// dưới tên "demo" thì từ chối, không xóa mất cookie và kho thật.
const MARKER = path.join(paths.root, ".demo-archive-marker");
if (fs.existsSync(paths.root)) {
  if (!fs.existsSync(MARKER) || fs.existsSync(paths.credentialsFile)) {
    console.error(`${paths.root} đã tồn tại và không phải kho demo (hoặc đã có đăng nhập thật). Không xóa gì cả.`);
    process.exit(1);
  }
  removePathSync(paths.root, { recursive: true, force: true });
}
fs.mkdirSync(paths.root, { recursive: true });
fs.writeFileSync(MARKER, "Kho demo do pnpm seed-demo tạo. Xóa file này nếu muốn giữ thư mục.\n");
const db = openArchiveDatabase(paths.databaseFile);


const SELF = "u-toi";
const FRIENDS = [
  ["u-lan", "Khúc Thị Ngạn"],
  ["u-minh", "Quế Văn Minh"],
  ["u-huong", "Trác Thị Khuê"],
  ["u-tuan", "Lư Văn Thoại"],
] as const;
const GROUPS = [
  ["g-giadinh", "Nhà Lư mình"],
  ["g-congty", "Nhóm Dự Án Mẫu"],
  ["g-banbe", "Hội bạn cấp 3"],
] as const;
const LINES = [
  "Chào anh, hôm nay anh rảnh không?",
  "Mai đi Bàu Lý nhé, nhớ mang áo ấm",
  "Ok để em kiểm tra lại rồi báo anh",
  "Báo giá tháng này em gửi trong file nhé",
  "Họp lúc 9h sáng mai ở phòng lớn",
  "Cảm ơn nha, mai gửi tiếp!",
  "Tối nay ăn gì đây cả nhà?",
  "Đã chuyển khoản rồi nha",
  "Hẹn cà phê cuối tuần",
  "Ảnh hôm qua đây",
];

replaceFriendDirectory(db, FRIENDS.map(([threadId, name]) => ({ threadId, name })));
upsertGroupNames(db, GROUPS.map(([threadId, name]) => ({ threadId, name })));
setMeta(db, "self_uid", SELF);
setMeta(db, "self_display_name", "Tôi (demo)");

const now = Date.now();
let seq = 1;
const threads = [...FRIENDS.map(([id, name]) => ({ id, name, type: "user" as const })), ...GROUPS.map(([id, name]) => ({ id, name, type: "group" as const }))];

for (let i = 0; i < 360; i++) {
  const t = threads[i % threads.length]!;
  const sentAt = new Date(now - (360 - i) * 2 * 3_600_000 * Math.random() - (360 - i) * 600_000).toISOString();
  const isSelf = i % 3 === 0;
  const member = FRIENDS[i % FRIENDS.length]!;
  const senderId = isSelf ? SELF : t.type === "user" ? t.id : member[0];
  const senderName = isSelf ? "Tôi (demo)" : t.type === "user" ? t.name : member[1];
  const withPhoto = i % 17 === 0;
  const withFile = i % 29 === 0;
  const attachments: AttachmentDescriptor[] = withPhoto
    ? [{ kind: "photo", remoteUrl: `https://f1.zdn.vn/demo/${i}.jpg`, fileName: null, declaredSize: null }]
    : withFile
      ? [{ kind: "file", remoteUrl: `https://dl.zdn.vn/demo/${i}`, fileName: `bao-cao-thang-${(i % 12) + 1}.txt`, declaredSize: 120 }]
      : [];
  const msg: NormalizedMessage = {
    msgId: String(7_000_000 + seq++),
    cliMsgId: null,
    threadId: t.id,
    threadType: t.type,
    senderId,
    senderName,
    isSelf,
    msgType: withPhoto ? "chat.photo" : withFile ? "share.file" : "webchat",
    text: withFile ? "" : LINES[i % LINES.length]!,
    quoteMsgId: null,
    sentAt,
    attachments,
    rawJson: "{}",
  };
  upsertMessage(db, msg, { source: i < 20 ? "old_messages" : "live", receivedAt: sentAt });
  if (i % 41 === 0) {
    recordRecall(db, { msgId: msg.msgId, threadId: t.id, recalledBy: senderId, recalledAt: sentAt, rawJson: "{}" });
  }
}

// "Tải" media giả: ảnh SVG có chữ, file chữ thường
for (let a = claimNextAttachment(db, new Date().toISOString()); a; a = claimNextAttachment(db, new Date().toISOString())) {
  const isPhoto = a.kind === "photo";
  const body = isPhoto
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="100%" height="100%" fill="#${crypto.randomBytes(3).toString("hex")}"/><text x="24" y="170" font-size="36" fill="#fff">Ảnh demo #${a.id}</text></svg>`
    : `Báo cáo demo #${a.id}\nDữ liệu giả để xem giao diện.\n`;
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  const rel = `${sha.slice(0, 2)}/${sha}${isPhoto ? ".svg" : ".txt"}`;
  fs.mkdirSync(path.join(paths.mediaDir, sha.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(paths.mediaDir, rel), body);
  markAttachmentDone(db, a.id, { localPath: rel, sha256: sha, sizeBytes: Buffer.byteLength(body), mime: isPhoto ? "image/svg+xml" : "text/plain; charset=utf-8" });
}

// Lịch sử kết nối có một khoảng thủng, và hàng đợi đủ trạng thái
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
recordConnectionEvent(db, "connected", { at: hoursAgo(72) });
recordConnectionEvent(db, "closed", { at: hoursAgo(30), code: 1006, detail: "mất mạng" });
recordConnectionEvent(db, "connected", { at: hoursAgo(29) });
const queue = (threadId: string, text: string, status: "draft" | "approved", mode: "single" | "batch" = "single") =>
  enqueueOutboxItem(db, { threadId, threadType: threadId.startsWith("g-") ? "group" : "user", text, mode, notBefore: null, batchId: mode === "batch" ? "demo-batch" : null, createdBy: "mcp", note: "demo", status });
queue("u-lan", "Nháp: chúc mừng sinh nhật Lan!", "draft");
queue("u-minh", "Anh Minh ơi, mai họp lúc mấy giờ ạ?", "draft");
const sent = queue("u-huong", "Đã nhận được tài liệu, cảm ơn chị", "approved");
db.prepare("UPDATE outbox SET status = 'sent', sending_started_at = ?, finished_at = ?, sent_msg_id = '1' WHERE id = ?").run(hoursAgo(5), hoursAgo(5), sent);
const failed = queue("u-tuan", "Tin này gửi hỏng (demo)", "approved");
db.prepare("UPDATE outbox SET status = 'failed', error = 'Demo: lỗi mạng', finished_at = ? WHERE id = ?").run(hoursAgo(3), failed);
setMeta(db, "daemon_session_state", "logged_out");
db.close();

console.log(`Đã tạo kho demo tại ${paths.root}`);
// Thêm "demo" vào danh sách nick (không đổi nick đang dùng, trừ khi chưa có nick nào)
const registry = loadOrImportAccountRegistry(dataDir);
if (!registry.accounts.some((a) => a.id === "demo")) {
  writeAccountRegistry(dataDir, {
    activeAccountId: registry.activeAccountId ?? "demo",
    accounts: [...registry.accounts, { id: "demo", uid: null, displayName: "Dữ liệu mẫu", avatarUrl: null, addedAt: new Date().toISOString(), lastActiveAt: null, readOnly: false }],
  });
}
console.log('Xem: chạy "pnpm start", mở dashboard, vào Tài khoản Zalo và chuyển sang nick "demo" (nếu chưa ở đó).');
