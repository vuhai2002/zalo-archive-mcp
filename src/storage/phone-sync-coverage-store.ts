import type { DatabaseSync } from "node:sqlite";

/**
 * Các lượt đồng bộ từ điện thoại đã xong phủ khoảng nào. Đồng bộ điện thoại lấy cả lịch sử trong khoảng đã chọn từ bản sao
 * lưu của điện thoại, nên khoảng listener không nghe nằm trọn trong đó thì chắc chắn kho đủ tin - dùng để báo "đã đồng bộ"
 * thay vì "chưa rõ" / "có thể thiếu".
 */
export function recordPhoneSyncCoverage(db: DatabaseSync, r: { fromTs: number; toTs: number; backupAt: string }): void {
  // 0 = không giới hạn: đầu thì từ đầu lịch sử (NULL), cuối thì tới lúc lấy bản sao lưu
  const fromAt = r.fromTs ? new Date(r.fromTs).toISOString() : null;
  const toAt = r.toTs ? new Date(Math.min(r.toTs, Date.parse(r.backupAt))).toISOString() : r.backupAt;
  db.prepare("INSERT INTO phone_sync_coverage (from_at, to_at, finished_at) VALUES (?, ?, ?)").run(fromAt, toAt, new Date().toISOString());
}

/** Có lượt đồng bộ điện thoại nào phủ trọn [fromIso, toIso] không */
export function phoneSyncCovers(db: DatabaseSync, fromIso: string, toIso: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM phone_sync_coverage WHERE (from_at IS NULL OR from_at <= ?) AND to_at >= ? LIMIT 1").get(fromIso, toIso),
  );
}
