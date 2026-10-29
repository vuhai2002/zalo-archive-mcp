import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/**
 * Nhật ký NGUYÊN VĂN mọi sự kiện listener, một dòng JSON mỗi sự kiện, mỗi ngày
 * (UTC) một file. Ghi TRƯỚC khi parse: parser sai hay văng thì dữ liệu vẫn còn,
 * sửa code rồi `pnpm replay-journal` dựng lại kho.
 *
 * Ghi đồng bộ (`appendFileSync`): nhịp tin nhắn cá nhân thấp, đổi lại thứ tự
 * dòng đúng thứ tự sự kiện và không mất dòng khi tiến trình bị kill.
 */
export type JournalRecord = {
  at: string;
  event: string;
  payload: unknown;
};

export function appendJournal(dir: string, record: JournalRecord): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.at.slice(0, 10)}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf-8", mode: 0o600 });
}

/** File nhật ký theo thứ tự thời gian */
export function listJournalFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Đọc từng dòng; dòng hỏng (vd ghi dở lúc mất điện) được báo qua `onBadLine` rồi bỏ qua */
export async function* readJournalFile(
  file: string,
  onBadLine: (lineNo: number) => void,
): AsyncGenerator<JournalRecord> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf-8"), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line.trim() === "") continue;
    try {
      yield JSON.parse(line) as JournalRecord;
    } catch {
      onBadLine(lineNo);
    }
  }
}
