import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import pino, { type Logger } from "pino";

/**
 * Logger ghi ra STDERR, không bao giờ ra stdout: MCP server chạy qua stdio dùng
 * stdout làm kênh giao thức, một dòng log lạc vào đó là hỏng phiên.
 *
 * Màn hình: một dòng chữ dễ đọc cho người dùng đang theo dõi lúc chạy thử.
 * File (daemon truyền `logFile`): JSON đầy đủ để tra lại sau.
 */
export function createLogger(opts: { name: string; level: string; logFile?: string }): Logger {
  const level = opts.level as pino.Level;
  const streams: pino.StreamEntry[] = [{ level, stream: humanReadableStderr() }];
  if (opts.logFile) {
    fs.mkdirSync(path.dirname(opts.logFile), { recursive: true });
    streams.push({ level, stream: pino.destination({ dest: opts.logFile, mkdir: true, sync: false }) });
  }
  return pino({ name: opts.name, level }, pino.multistream(streams));
}

/** Logger câm cho test */
export function createSilentLogger(): Logger {
  return pino({ level: "silent" });
}

const LEVEL_LABEL: Record<number, string> = { 10: "TRACE", 20: "DEBUG", 30: "INFO", 40: "WARN", 50: "ERROR", 60: "FATAL" };
const OMIT_KEYS = new Set(["level", "time", "pid", "hostname", "name", "msg", "part"]);

function humanReadableStderr(): Writable {
  return new Writable({
    write(chunk, _enc, done) {
      for (const line of String(chunk).split("\n")) {
        if (line.trim()) process.stderr.write(`${formatLine(line)}\n`);
      }
      done();
    },
  });
}

function formatLine(line: string): string {
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return line;
  }
  const time = new Date(Number(rec.time)).toLocaleTimeString("vi-VN", { hour12: false });
  const who = [rec.name, rec.part].filter(Boolean).join("/");
  const extras = Object.entries(rec)
    .filter(([k]) => !OMIT_KEYS.has(k))
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(" ");
  return `${time} ${LEVEL_LABEL[Number(rec.level)] ?? rec.level} [${who}] ${rec.msg ?? ""}${extras ? ` | ${extras}` : ""}`;
}

function formatValue(v: unknown): string {
  if (v && typeof v === "object" && "message" in v) return JSON.stringify((v as { message: unknown }).message);
  return typeof v === "string" ? v : JSON.stringify(v);
}
