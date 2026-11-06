import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { describeUnimportedBackupFiles } from "./describe-unimported-backup-files.js";

describe("log file trong bản sao lưu kho không nhập", () => {
  it("bỏ file hội thoại đã nhập; gộp file khác theo dạng tên; chỉ ra file có bảng tin chat; giữ tên lạ không giải nén", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-unimported-"));
    const file = (name: string, body = "x") => {
      fs.writeFileSync(path.join(dir, name), body);
      return { name, path: path.join(dir, name), size: fs.statSync(path.join(dir, name)).size };
    };
    const chat = path.join(dir, "send2me_42.db");
    const db = new DatabaseSync(chat);
    db.exec("CREATE TABLE ChatContent (MsgId INTEGER); INSERT INTO ChatContent VALUES (1), (2), (3);");
    db.close();
    const files = [
      file("123.db"),
      file("group_5.db"),
      file("123.db-journal"),
      file("456.db-journal"),
      file("settings.json"),
      { name: "send2me_42.db", path: chat, size: fs.statSync(chat).size },
    ];
    const s = describeUnimportedBackupFiles(files, ["../../evil"]);
    assert.equal(s.files, 4);
    assert.deepEqual(s.patterns[0], { pattern: "#.db-journal", count: 2, bytes: 2, examples: ["123.db-journal", "456.db-journal"] });
    assert.deepEqual(s.chatDbs, [{ name: "send2me_42.db", bytes: fs.statSync(chat).size, rows: 3 }]);
    assert.deepEqual(s.unsafeNames, ["../../evil"]);
  });
});
