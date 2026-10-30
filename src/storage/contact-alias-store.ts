import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";

/**
 * Tên gợi nhớ (alias) mình đặt cho người khác trên Zalo. Zalo PC hiện tên này thay cho tên người đó
 * tự đặt - ở danh sách, đầu khung chat, tên người gửi trong nhóm - nên dashboard và MCP cũng vậy
 * (`COALESCE(alias, ...)` lúc đọc). Danh sách Zalo trả về là TRỌN BỘ: ai không còn trong đó là đã bỏ
 * tên gợi nhớ.
 */
export type ContactAlias = { userId: string; alias: string };

/** Thay toàn bộ tên gợi nhớ bằng danh sách mới; trả về số người có tên gợi nhớ */
export function replaceContactAliases(db: DatabaseSync, aliases: ContactAlias[]): number {
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare("UPDATE contacts SET alias = NULL WHERE alias IS NOT NULL").run();
    const stmt = db.prepare(
      `INSERT INTO contacts (user_id, alias, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET alias = excluded.alias`,
    );
    for (const a of aliases) stmt.run(a.userId, a.alias, now);
  });
  return aliases.length;
}
