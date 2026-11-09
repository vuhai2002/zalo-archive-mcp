import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { AccountPaths } from "../config/account-paths.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";

/**
 * Tổng dung lượng kho của một nick trên ổ (như dòng "Dữ liệu Zalo" của Zalo PC): media, DB tin nhắn, nhật ký thô, bản sao
 * DB cũ, thư mục tạm; cùng dung lượng ổ đĩa. Đi hết thư mục media mất khá lâu khi kho nhiều file nên tính BẤT ĐỒNG BỘ ở nền
 * (không chặn daemon đang nghe tin), nhớ kết quả vào `meta` kèm giờ tính - trang hiện ngay số lần trước + "Làm mới".
 */
export type StorageSummary = {
  computedAt: string;
  drive: { totalBytes: number; freeBytes: number };
  mediaBytes: number;
  mediaFiles: number;
  databaseBytes: number;
  journalBytes: number;
  tempBytes: number;
  backups: Array<{ name: string; bytes: number; modifiedAt: string }>;
};

const META_KEY = "storage_summary";
/** Bản sao DB người dùng / kho đã tạo cạnh archive.db (vd archive-truoc-dong-bo-...db) */
export const BACKUP_NAME = /^archive-[\w.-]+\.db$/;
const STAT_BATCH = 200;

async function sizeOf(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/** Tổng cỡ + số file trong thư mục (đệ quy), stat theo lô để không mở quá nhiều file một lúc */
export async function directorySize(dir: string): Promise<{ bytes: number; files: number }> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes: 0, files: 0 };
  }
  let bytes = 0;
  let files = 0;
  const plain = entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  for (let i = 0; i < plain.length; i += STAT_BATCH) {
    const sizes = await Promise.all(plain.slice(i, i + STAT_BATCH).map(sizeOf));
    bytes += sizes.reduce((s, n) => s + n, 0);
    files += sizes.length;
  }
  for (const sub of entries.filter((e) => e.isDirectory())) {
    const r = await directorySize(path.join(dir, sub.name));
    bytes += r.bytes;
    files += r.files;
  }
  return { bytes, files };
}

export async function computeStorageSummary(paths: AccountPaths, now: () => Date = () => new Date()): Promise<StorageSummary> {
  const media = await directorySize(paths.mediaDir);
  const db = paths.databaseFile;
  const databaseBytes = (await Promise.all([db, `${db}-wal`, `${db}-shm`].map(sizeOf))).reduce((s, n) => s + n, 0);
  const names = await fs.readdir(paths.root).catch(() => [] as string[]);
  const backups = await Promise.all(
    names
      .filter((n) => BACKUP_NAME.test(n))
      .map(async (name) => {
        const st = await fs.stat(path.join(paths.root, name));
        return { name, bytes: st.size, modifiedAt: st.mtime.toISOString() };
      }),
  );
  const drive = await fs.statfs(paths.root);
  return {
    computedAt: now().toISOString(),
    drive: { totalBytes: drive.blocks * drive.bsize, freeBytes: drive.bavail * drive.bsize },
    mediaBytes: media.bytes,
    mediaFiles: media.files,
    databaseBytes,
    journalBytes: (await directorySize(paths.journalDir)).bytes,
    tempBytes: (await directorySize(path.join(paths.root, "mobile-sync-tmp"))).bytes,
    backups: backups.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
  };
}

/** Một phép tính đang chạy cho mỗi thư mục nick: bấm Làm mới nhiều lần không chạy chồng */
const running = new Map<string, Promise<void>>();

/**
 * Số lần tính gần nhất (null nếu chưa từng) + có đang tính không. `refresh` hoặc chưa có số thì bắt đầu tính ở nền (trả ngay,
 * không chờ); tính xong ghi vào `meta`.
 */
export function storageSummaryState(
  db: DatabaseSync,
  paths: AccountPaths,
  o: { refresh?: boolean; onError?: (err: unknown) => void } = {},
): { summary: StorageSummary | null; computing: boolean } {
  const raw = getMeta(db, META_KEY);
  let summary: StorageSummary | null = null;
  try {
    summary = raw ? (JSON.parse(raw) as StorageSummary) : null;
  } catch {
    summary = null;
  }
  if ((o.refresh || !summary) && !running.has(paths.root)) {
    const job = computeStorageSummary(paths)
      .then((s) => setMeta(db, META_KEY, JSON.stringify(s)))
      .catch((err: unknown) => o.onError?.(err))
      .finally(() => running.delete(paths.root));
    running.set(paths.root, job);
  }
  return { summary, computing: running.has(paths.root) };
}

/** Chờ phép tính nền đang chạy xong (dùng trong test) */
export const storageSummaryIdle = (paths: AccountPaths) => running.get(paths.root) ?? Promise.resolve();
