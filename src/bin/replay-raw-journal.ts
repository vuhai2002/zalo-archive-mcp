// Chạy lại nhật ký sự kiện thô vào kho - dùng sau khi sửa parser.
// Tin đã có: cập nhật cột suy ra (giữ nguồn + giờ nhận cũ). Tin mới: ghi source = journal_replay.
// Chạy cho nick đang dùng trên dashboard. Cách dùng: pnpm replay-journal   (nên tắt daemon trước)
import { activeAccountForCli } from "../accounts/active-account-for-cli.js";
import { getEnv } from "../config/env.js";
import { ingestArchiveEvent, type ArchiveEvent } from "../archive/archive-event-ingestor.js";
import { listJournalFiles, readJournalFile } from "../archive/raw-event-journal.js";
import { createLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";

const ARCHIVE_EVENT_KINDS = new Set(["message", "undo", "old_messages"]);

/** Cảm xúc / sự kiện nhóm được ghi nhật ký ở dạng payload nguyên văn của zca-js: bọc lại thành ArchiveEvent */
function rawEventToArchiveEvent(event: string, payload: unknown): ArchiveEvent | null {
  if (event === "reaction") return { kind: "reaction", reaction: payload };
  if (event === "old_reactions") {
    const reactions = (payload as { reactions?: unknown } | null)?.reactions;
    return Array.isArray(reactions) ? { kind: "old_reactions", reactions } : null;
  }
  if (event === "group_event") return { kind: "group_event", event: payload };
  return null;
}

const env = getEnv();
const { paths } = activeAccountForCli(env);
const log = createLogger({ name: "replay-journal", level: env.LOG_LEVEL });
const db = openArchiveDatabase(paths.databaseFile);

const files = listJournalFiles(paths.journalDir);
if (files.length === 0) {
  console.log(`Không có nhật ký nào trong ${paths.journalDir}`);
  process.exit(0);
}

const total = { events: 0, stored: 0, recalls: 0, reactions: 0, skipped: 0, badLines: 0 };
for (const file of files) {
  for await (const record of readJournalFile(file, (lineNo) => {
    total.badLines++;
    log.warn({ file, lineNo }, "Dòng nhật ký hỏng, bỏ qua");
  })) {
    const event = ARCHIVE_EVENT_KINDS.has(record.event) ? (record.payload as ArchiveEvent) : rawEventToArchiveEvent(record.event, record.payload);
    if (!event) continue;
    total.events++;
    const stats = ingestArchiveEvent(db, event, new Date(record.at), log, "journal_replay");
    total.stored += stats.stored;
    total.recalls += stats.recalls;
    total.reactions += stats.reactions;
    total.skipped += stats.skipped;
  }
}
db.close();
console.log(
  `Xong ${files.length} file: ${total.events} sự kiện, ${total.stored} tin, ${total.recalls} thu hồi, ` +
    `${total.reactions} cảm xúc, ${total.skipped} bỏ qua, ${total.badLines} dòng hỏng.`,
);
