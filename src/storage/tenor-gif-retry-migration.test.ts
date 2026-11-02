import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { ARCHIVE_MIGRATIONS } from "./archive-schema-migrations.js";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("nâng kho: gif ở bản chép Tenor của Zalo đã bị đóng là hết hạn", () => {
  it("xếp tải lại một lần gif ở media-ten.z-cdn.me đã hỏng; gif / ảnh khác giữ nguyên", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-tenor-gif-"));
    const file = path.join(dir, "archive.db");
    const old = new DatabaseSync(file);
    ARCHIVE_MIGRATIONS.slice(0, 20).forEach((sql) => old.exec(sql));
    old.exec("PRAGMA user_version = 20");
    old.exec(
      `INSERT INTO messages (msg_id, thread_id, thread_type, sender_id, is_self, msg_type, text, sent_at, received_at, source, raw_json)
       VALUES ('m1', 't', 'user', 't', 0, 'chat.gif', '', '2023-04-30T00:00:00Z', '2026-11-02T00:00:00Z', 'mobile_sync', '{}')`,
    );
    const insert = old.prepare(
      `INSERT INTO attachments (msg_id, kind, remote_url, status, attempts, renewed_at, last_error, created_at)
       VALUES ('m1', ?, ?, 'failed', 1, '2026-11-02T07:27:00Z', ?, '2026-11-02T00:00:00Z')`,
    );
    insert.run("gif", "https://media-ten.z-cdn.me/ExampleGif0AAAAM/a.gif", "Link hết hạn, Zalo không cấp lại link cho loại file này");
    insert.run("gif", "https://photo.zdn.vn/gif/b.gif", "Link hết hạn, Zalo không cấp lại link cho loại file này");
    insert.run("photo", "https://media-ten.z-cdn.me/x/c.jpg", "HTTP 404");
    old.close();

    const db = openArchiveDatabase(file);
    try {
      const rows = db.prepare("SELECT kind, status, attempts, renewed_at, last_error FROM attachments ORDER BY id").all();
      assert.deepEqual(
        rows.map((r) => [r.kind, r.status, r.attempts, r.renewed_at, r.last_error]),
        [
          ["gif", "pending", 0, null, null],
          ["gif", "failed", 1, "2026-11-02T07:27:00Z", "Link hết hạn, Zalo không cấp lại link cho loại file này"],
          ["photo", "failed", 1, "2026-11-02T07:27:00Z", "HTTP 404"],
        ],
      );
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
