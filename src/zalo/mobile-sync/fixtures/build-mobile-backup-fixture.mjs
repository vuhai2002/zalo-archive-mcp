// Tạo dữ liệu mẫu cho test đồng bộ từ điện thoại: 2 file SQLite (bảng ChatContent như bản sao lưu
// Zalo mobile), nối liền rồi nén XZ. Chạy một lần, file kết quả được commit làm fixture.
// Cách dùng: node src/zalo/mobile-sync/fixtures/build-mobile-backup-fixture.mjs src/zalo/mobile-sync/fixtures   (cần lệnh xz)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const outDir = process.argv[2];
const work = fs.mkdtempSync(path.join(os.tmpdir(), "zam-fixture-"));

function makeDb(name, rows) {
  const file = path.join(work, name);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA page_size = 1024; PRAGMA journal_mode = DELETE;
    CREATE TABLE ChatContent (SenderId INTEGER, CliMsgId INTEGER, GlbMsgId INTEGER, MsgType INTEGER, TimeStamp INTEGER,
      TTL INTEGER, MsgContent TEXT, BinNet BLOB, MsgStatus INTEGER)`);
  const stmt = db.prepare("INSERT INTO ChatContent VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const r of rows) stmt.run(...r);
  db.close();
  return { name, bytes: fs.readFileSync(file) };
}

// uid "plain" (dạng ngắn của điện thoại): 999 = chính mình, 1001 = Lan; nhóm 2002
const T0 = 1767225600000; // 01/01/2026 00:00 UTC
const dbs = [
  makeDb("1001.db", [
    [1001, 1, 7000000000001n, 0, T0, 0, "Tin cũ từ điện thoại", null, 1],
    [999, 2, 7000000000002n, 0, T0 + 60_000, 0, "Mình trả lời trên điện thoại", null, 1],
    [1001, 3, 7000000000003n, 0, T0 + 120_000, 0, "Tin lỗi gửi (MsgStatus 0) - không nhập", null, 0],
  ]),
  makeDb("group_2002.db", [[1001, 4, 7000000000004n, 0, T0 + 180_000, 0, "Tin nhóm cũ", null, 1]]),
];

const joined = Buffer.concat(dbs.map((d) => d.bytes));
const raw = path.join(work, "joined.bin");
fs.writeFileSync(raw, joined);
execFileSync("xz", ["-9", "--keep", "--check=crc64", raw]);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(`${raw}.xz`, path.join(outDir, "mobile-backup-two-threads.xz"));
fs.writeFileSync(
  path.join(outDir, "mobile-backup-two-threads.json"),
  `${JSON.stringify({ entries: dbs.map((d) => ({ name: d.name, size: d.bytes.length })) }, null, 2)}\n`,
);
console.log("xz bytes:", fs.statSync(`${raw}.xz`).size, "entries:", dbs.map((d) => `${d.name}:${d.bytes.length}`).join(", "));
fs.rmSync(work, { recursive: true, force: true });
