// Chạy lại nhật ký sự kiện thô vào kho - dùng sau khi sửa parser.
// Tin đã có: cập nhật cột suy ra (giữ nguồn + giờ nhận cũ). Tin mới: ghi source = journal_replay.
// Cách dùng: pnpm replay-journal   (nên tắt daemon trước)
import { accountPaths } from "../config/account-paths.js";
import { getEnv } from "../config/env.js";
import { ingestArchiveEvent, type ArchiveEvent } from "../archive/archive-event-ingestor.js";
import { listJournalFiles, readJournalFile } from "../archive/raw-event-journal.js";
import { createLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";

const ARCHIVE_EVENT_KINDS = new Set(["message", "undo", "old_messages"]);

const env = getEnv();
const paths = accountPaths(env);
const log = createLogger({ name: "replay-journal", level: env.LOG_LEVEL });
const db = openArchiveDatabase(paths.databaseFile);

const files = listJournalFiles(paths.journalDir);
if (files.length === 0) {
  console.log(`Không có nhật ký nào trong ${paths.journalDir}`);
  process.exit(0);
}

const total = { events: 0, stored: 0, recalls: 0, skipped: 0, badLines: 0 };
for (const file of files) {
  for await (const record of readJournalFile(file, (lineNo) => {
    total.badLines++;
    log.warn({ file, lineNo }, "Dòng nhật ký hỏng, bỏ qua");
  })) {
    if (!ARCHIVE_EVENT_KINDS.has(record.event)) continue;
    total.events++;
    const stats = ingestArchiveEvent(db, record.payload as ArchiveEvent, new Date(record.at), log, "journal_replay");
    total.stored += stats.stored;
    total.recalls += stats.recalls;
    total.skipped += stats.skipped;
  }
}
db.close();
console.log(
  `Xong ${files.length} file: ${total.events} sự kiện, ${total.stored} tin, ${total.recalls} thu hồi, ` +
    `${total.skipped} bỏ qua, ${total.badLines} dòng hỏng.`,
);
