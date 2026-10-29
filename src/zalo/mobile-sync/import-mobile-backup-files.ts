import { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { upsertMessage } from "../../storage/message-write-store.js";
import { normalizeMessage, type RawListenerMessage } from "../normalize-zalo-event.js";
import {
  chatContentOutOfRangeCount,
  chatContentQueryRange,
  collectPlainUserIds,
  parseThreadFileName,
  rowToPlainMessage,
  toZaloMessage,
  type PlainMessage,
} from "./mobile-chat-row-to-message.js";
import type { ExtractedFile } from "./decrypt-zdb-backup.js";
import type { MobileSyncStats, NoisedIdsResult } from "./mobile-sync-types.js";

/**
 * Nhập các file SQLite hội thoại (đã giải nén từ bản sao lưu điện thoại) vào kho - phần
 * "importConversations" của deplao viết lại cho `node:sqlite` và đường ghi kho của mình:
 * mỗi dòng ChatContent -> tin dạng zca-js -> `normalizeMessage` -> `upsertMessage`
 * (source `mobile_sync`), y như tin listener nhận trực tiếp. Tin đã có (live, lấy bù,
 * lần đồng bộ trước) khử trùng theo msg_id nên đồng bộ lại khoảng chồng nhau cũng không sao.
 */
export type ImportDeps = {
  db: DatabaseSync;
  /** API `znoise` của Zalo: đổi id "plain" (điện thoại) sang id web */
  getNoisedIds: (p: { uids: string[]; gids: string[] }) => Promise<NoisedIdsResult>;
  ownNoiseId: string;
  ownPlainId: string;
  range: { fromTs: number; toTs: number };
  stats: MobileSyncStats;
  log: Logger;
  shouldAbort: () => boolean;
  onProgress: (percent: number) => void;
  onStage: (message: string) => void;
};

const BATCH = 1000;
const NOISE_BATCH = 500;

export class MobileSyncCancelled extends Error {}

/** Cặp plain -> noise đã biết (bảng mobile_id_map), đổi thêm qua znoise khi thiếu */
function idCache(deps: ImportDeps, kind: "user" | "group") {
  const map = new Map<string, string>();
  for (const r of deps.db.prepare("SELECT plain_id, noise_id FROM mobile_id_map WHERE kind = ?").all(kind) as Array<{
    plain_id: string;
    noise_id: string;
  }>) {
    map.set(r.plain_id, r.noise_id);
  }
  const save = deps.db.prepare("INSERT OR REPLACE INTO mobile_id_map (kind, plain_id, noise_id) VALUES (?, ?, ?)");
  return {
    get: (plainId: string) => map.get(plainId) || undefined,
    resolve: async (plainIds: string[]) => {
      const missing = [...new Set(plainIds)].filter((id) => /^\d+$/.test(id) && id !== deps.ownPlainId && !map.has(id));
      for (let i = 0; i < missing.length; i += NOISE_BATCH) {
        if (deps.shouldAbort()) throw new MobileSyncCancelled();
        const chunk = missing.slice(i, i + NOISE_BATCH);
        const res = await withRetry(() => deps.getNoisedIds(kind === "user" ? { uids: chunk, gids: [] } : { uids: [], gids: chunk }));
        const list = kind === "user" ? res.fids : res.gids;
        chunk.forEach((plainId, idx) => {
          const noiseId = list[idx] ?? "";
          map.set(plainId, noiseId);
          if (noiseId) save.run(kind, plainId, noiseId);
        });
      }
    },
  };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
    }
  }
  throw new Error(`Không đổi được id hội thoại từ điện thoại: ${last instanceof Error ? last.message : String(last)}`);
}

export async function importMobileBackupFiles(files: ExtractedFile[], deps: ImportDeps): Promise<void> {
  const { stats } = deps;
  const threads = files.flatMap((file) => {
    const ref = parseThreadFileName(file.name);
    return ref ? [{ file, ref }] : [];
  });
  stats.conversations = threads.length;

  deps.onStage("Đang ghép hội thoại trên điện thoại với hội thoại trong kho...");
  const users = idCache(deps, "user");
  const groups = idCache(deps, "group");
  await users.resolve(threads.filter((t) => !t.ref.isGroup).map((t) => t.ref.plainId));
  await groups.resolve(threads.filter((t) => t.ref.isGroup).map((t) => t.ref.plainId));

  deps.onStage("Đang nhập tin nhắn vào kho...");
  const query = chatContentQueryRange(deps.range.fromTs, deps.range.toTs);
  const outOfRange = chatContentOutOfRangeCount(deps.range.fromTs, deps.range.toTs);
  const receivedAt = new Date();

  for (let i = 0; i < threads.length; i++) {
    if (deps.shouldAbort()) throw new MobileSyncCancelled();
    const { file, ref } = threads[i]!;
    const noiseId = ref.isGroup ? groups.get(ref.plainId) : ref.plainId === deps.ownPlainId ? deps.ownNoiseId : users.get(ref.plainId);
    if (!noiseId) {
      stats.conversationsUnresolved++;
      continue;
    }
    stats.conversationsResolved++;
    const thread = { ...ref, noiseId };
    const src = new DatabaseSync(file.path, { readOnly: true });
    try {
      if (!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ChatContent'").get()) continue;
      if (outOfRange) stats.messagesOutOfRange += Number((src.prepare(outOfRange).get() as { outside?: unknown })?.outside) || 0;
      const stmt = src.prepare(query);
      // Id tin là số 64 bit: đọc dạng BigInt để không mất chữ số
      stmt.setReadBigInts(true);
      let batch: PlainMessage[] = [];
      const flush = async () => {
        const needed = new Set<string>();
        for (const m of batch) collectPlainUserIds(m, needed);
        await users.resolve([...needed]);
        for (const m of batch) {
          const converted = toZaloMessage(m, { ownNoiseId: deps.ownNoiseId, ownPlainId: deps.ownPlainId, thread, resolveUser: users.get });
          // Tin bị thu hồi trên điện thoại không còn nội dung: bỏ qua, như Zalo PC
          if (!converted || converted.isRecalled) {
            stats.messagesSkipped++;
            continue;
          }
          const raw: RawListenerMessage = {
            threadType: converted.type === 1 ? "group" : "user",
            threadId: converted.threadId,
            isSelf: converted.isSelf,
            data: converted.data,
          };
          const msg = normalizeMessage(raw, receivedAt);
          if (!msg) {
            stats.messagesSkipped++;
            continue;
          }
          const res = upsertMessage(deps.db, msg, { source: "mobile_sync", receivedAt: receivedAt.toISOString() });
          if (res.inserted) stats.messagesImported++;
          else stats.messagesSkipped++;
        }
        batch = [];
        // Nhường vòng sự kiện: daemon vẫn nghe tin, dashboard vẫn trả lời trong lúc nhập
        await new Promise((r) => setImmediate(r));
      };
      for (const row of stmt.iterate()) {
        stats.messagesRead++;
        const plain = rowToPlainMessage(row);
        if (!plain) {
          stats.messagesSkipped++;
          continue;
        }
        batch.push(plain);
        if (batch.length >= BATCH) await flush();
      }
      if (batch.length) await flush();
    } catch (err) {
      if (err instanceof MobileSyncCancelled) throw err;
      deps.log.warn({ err, file: file.name }, "Bỏ qua một hội thoại trong bản sao lưu (đọc lỗi)");
    } finally {
      src.close();
    }
    deps.onProgress(((i + 1) / threads.length) * 100);
  }
}
