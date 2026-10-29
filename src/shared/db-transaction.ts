import type { DatabaseSync } from "node:sqlite";

/**
 * Chạy `work` trong một giao dịch SQLite (`node:sqlite` không có
 * `db.transaction()` như better-sqlite3). Lấy từ zalo-agent.
 *
 * `BEGIN IMMEDIATE` lấy khóa ghi ngay từ đầu: daemon và MCP server là HAI tiến
 * trình cùng mở một file DB, nâng khóa giữa chừng dễ dính SQLITE_BUSY.
 *
 * `work` bị CHẶN Ở KIỂU nếu trả Promise: COMMIT chạy đồng bộ ngay sau `work()`,
 * nên callback async sẽ commit trước khi việc thật kịp chạy.
 */
type NotPromise<T> = T extends Promise<unknown> ? never : T;

export function inTransaction<T>(db: DatabaseSync, work: () => NotPromise<T>): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* giữ lỗi gốc */
    }
    throw err;
  }
}
