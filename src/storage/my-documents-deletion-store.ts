import type { DatabaseSync } from "node:sqlite";
import { getMeta } from "./thread-directory-store.js";

/**
 * "My Documents" của Zalo: hội thoại riêng để cất đồ của mình (mã `loginInfo.send2me_id`, KHÔNG phải hội
 * thoại với chính mình). Người dùng chốt 03/11/2026: tin xóa ở đây (Zalo đồng bộ lệnh "xóa ở phía tôi",
 * `chat.delete`) thì kho xóa hẳn, không giữ - khác các hội thoại khác, nơi kho vẫn giữ tin đã xóa. Việc xóa +
 * ghi nhớ mã tin nằm ở `deleted-message-store.ts`.
 */
export const MY_DOCUMENTS_META_KEY = "my_documents_thread_id";

/** Mã hội thoại My Documents: lưu lúc đăng nhập; chưa có thì nhận theo ảnh thư mục Zalo trả trong hồ sơ */
export function myDocumentsThreadId(db: DatabaseSync): string | null {
  const saved = getMeta(db, MY_DOCUMENTS_META_KEY);
  if (saved) return saved;
  const row = db.prepare("SELECT user_id FROM contacts WHERE avatar_url LIKE '%zds_cic_my_documents%' LIMIT 1").get() as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}
