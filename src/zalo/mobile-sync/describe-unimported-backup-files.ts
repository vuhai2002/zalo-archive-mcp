import { DatabaseSync } from "node:sqlite";
import type { ExtractedFile } from "./decrypt-zdb-backup.js";
import { parseThreadFileName } from "./mobile-chat-row-to-message.js";

/**
 * Tóm tắt các file trong bản sao lưu điện thoại mà kho KHÔNG nhập (không đúng dạng `<mã>.db` /
 * `group_<mã>.db`, hoặc tên lạ không giải nén), để ghi log: chỉ tên, cỡ và số dòng chat - không ghi nội dung.
 * Dùng để dò xem lịch sử My Documents có nằm trong một file tên khác không (đợt đồng bộ toàn bộ lịch sử không có).
 */
export type UnimportedBackupSummary = {
  files: number;
  /** Gộp theo dạng tên (mỗi dãy số thay bằng `#`): số file, tổng cỡ, vài tên ví dụ */
  patterns: Array<{ pattern: string; count: number; bytes: number; examples: string[] }>;
  /** File SQLite có bảng tin `ChatContent` mà kho không nhập - ứng viên hội thoại bị bỏ sót */
  chatDbs: Array<{ name: string; bytes: number; rows: number }>;
  /** Tên lạ (ký tự không an toàn) nên không giải nén */
  unsafeNames: string[];
};

const MAX_EXAMPLES = 5;
const MAX_UNSAFE = 50;

export function describeUnimportedBackupFiles(files: readonly ExtractedFile[], unsafeNames: readonly string[]): UnimportedBackupSummary {
  const groups = new Map<string, { count: number; bytes: number; examples: string[] }>();
  const chatDbs: UnimportedBackupSummary["chatDbs"] = [];
  let count = 0;
  for (const f of files) {
    if (parseThreadFileName(f.name)) continue;
    count++;
    const pattern = f.name.replace(/\d+/g, "#");
    const g = groups.get(pattern) ?? { count: 0, bytes: 0, examples: [] };
    g.count++;
    g.bytes += f.size;
    if (g.examples.length < MAX_EXAMPLES) g.examples.push(f.name);
    groups.set(pattern, g);
    const rows = chatRowCount(f.path);
    if (rows !== null) chatDbs.push({ name: f.name, bytes: f.size, rows });
  }
  return {
    files: count,
    patterns: [...groups].map(([pattern, g]) => ({ pattern, ...g })).sort((a, b) => b.count - a.count),
    chatDbs,
    unsafeNames: unsafeNames.slice(0, MAX_UNSAFE).map((n) => n.slice(0, 120)),
  };
}

/** Số dòng bảng `ChatContent` nếu file là SQLite có bảng đó; không phải thì null */
function chatRowCount(file: string): number | null {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ChatContent'").get()) return null;
    return Number((db.prepare("SELECT COUNT(*) AS n FROM ChatContent").get() as { n: number }).n);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
