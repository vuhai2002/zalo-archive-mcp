import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inTransaction } from "../shared/db-transaction.js";
import { ARCHIVE_MIGRATIONS } from "./archive-schema-migrations.js";

/**
 * Mở (và nâng schema nếu cần) DB kho của một account.
 *
 * Daemon và MCP server là hai tiến trình mở CHUNG file này, nên:
 * - WAL để đọc không chặn ghi;
 * - busy_timeout để tiến trình này chờ khi tiến trình kia đang giữ khóa ghi,
 *   thay vì văng SQLITE_BUSY;
 * - nâng schema trong `BEGIN IMMEDIATE` và đọc lại `user_version` BÊN TRONG
 *   giao dịch, để hai tiến trình khởi động cùng lúc không chạy một bước hai lần.
 *
 * `file` = ":memory:" cho test.
 */
export function openArchiveDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 10000");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");
  migrate(db);
  return db;
}

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function migrate(db: DatabaseSync): void {
  if (currentVersion(db) >= ARCHIVE_MIGRATIONS.length) return;
  inTransaction(db, () => {
    for (let v = currentVersion(db); v < ARCHIVE_MIGRATIONS.length; v++) {
      db.exec(ARCHIVE_MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.prepare("INSERT OR IGNORE INTO send_control (id, killed, changed_at) VALUES (1, 0, ?)").run(
      new Date().toISOString(),
    );
  });
}
