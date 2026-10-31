import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { ARCHIVE_MIGRATIONS } from "./archive-schema-migrations.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("nâng kho: file xin lại link hỏng vì gửi thiếu tham số", () => {
  it("bỏ dấu 'đã xin' chỉ cho file hỏng vì 'Tham số không hợp lệ'; ảnh Zalo đã xóa giữ nguyên", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-file-renew-"));
    const file = path.join(dir, "archive.db");
    const old = new DatabaseSync(file);
    ARCHIVE_MIGRATIONS.slice(0, 17).forEach((sql) => old.exec(sql));
    old.exec("PRAGMA user_version = 17");
    old.exec(
      `INSERT INTO messages (msg_id, thread_id, thread_type, sender_id, is_self, msg_type, text, sent_at, received_at, source, raw_json)
       VALUES ('m1', 't', 'user', 't', 0, 'share.file', '', '2026-10-10T00:00:00Z', '2026-10-31T00:00:00Z', 'mobile_sync', '{}')`,
    );
    const insert = old.prepare(
      `INSERT INTO attachments (msg_id, kind, remote_url, status, renewed_at, last_error, created_at)
       VALUES ('m1', ?, ?, 'failed', '2026-11-01T00:00:00Z', ?, '2026-10-31T00:00:00Z')`,
    );
    insert.run("file", "https://f.dlfl.vn/a", "Link hết hạn, Zalo không cấp lại link mới (Tham số không hợp lệ)");
    insert.run("photo", "https://p.zdn.vn/b", "Link hết hạn, Zalo không cấp lại link mới (mã lỗi 1001)");
    old.close();

    const db = openArchiveDatabase(file);
    try {
      const rows = db.prepare("SELECT kind, renewed_at FROM attachments ORDER BY id").all();
      assert.deepEqual(rows.map((r) => [r.kind, r.renewed_at]), [["file", null], ["photo", "2026-11-01T00:00:00Z"]]);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
