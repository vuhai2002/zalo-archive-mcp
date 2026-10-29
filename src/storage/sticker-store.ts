import type { DatabaseSync } from "node:sqlite";

/**
 * Tin sticker của Zalo chỉ mang số hiệu sticker (`content.id`), không có link ảnh.
 * Daemon hỏi Zalo ảnh của từng số hiệu (lưu ở `sticker_catalog`, hỏi một lần dùng
 * mãi), rồi gắn ảnh vào tin như một đính kèm loại `sticker` để tải về kho.
 */
export type PendingSticker = { msgId: string; stickerId: number };

/** Tin sticker chưa có đính kèm ảnh, mới nhất trước */
export function pendingStickerMessages(db: DatabaseSync, limit: number): PendingSticker[] {
  const rows = db
    .prepare(
      `SELECT m.msg_id, m.raw_json FROM messages m
       WHERE m.msg_type = 'chat.sticker' AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.msg_id = m.msg_id)
       ORDER BY m.id DESC LIMIT ?`,
    )
    .all(limit) as Array<{ msg_id: string; raw_json: string }>;
  const out: PendingSticker[] = [];
  for (const r of rows) {
    try {
      const id = Number((JSON.parse(r.raw_json) as { content?: { id?: unknown } }).content?.id);
      if (Number.isInteger(id) && id > 0) out.push({ msgId: r.msg_id, stickerId: id });
    } catch {
      /* raw hỏng thì bỏ qua tin này */
    }
  }
  return out;
}

export type CatalogEntry = { imageUrl: string | null; status: "ok" | "failed"; fetchedAt: string };

export function getStickerCatalog(db: DatabaseSync, stickerIds: number[]): Map<number, CatalogEntry> {
  const stmt = db.prepare("SELECT image_url, status, fetched_at FROM sticker_catalog WHERE sticker_id = ?");
  const map = new Map<number, CatalogEntry>();
  for (const id of new Set(stickerIds)) {
    const row = stmt.get(id) as { image_url: string | null; status: "ok" | "failed"; fetched_at: string } | undefined;
    if (row) map.set(id, { imageUrl: row.image_url, status: row.status, fetchedAt: row.fetched_at });
  }
  return map;
}

export function saveStickerCatalog(db: DatabaseSync, stickerId: number, imageUrl: string | null): void {
  db.prepare(
    `INSERT INTO sticker_catalog (sticker_id, image_url, status, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (sticker_id) DO UPDATE SET image_url = excluded.image_url, status = excluded.status,
       fetched_at = excluded.fetched_at`,
  ).run(stickerId, imageUrl, imageUrl ? "ok" : "failed", new Date().toISOString());
}

/** Gắn ảnh sticker vào tin để vòng tải media tải về */
export function attachStickerImage(db: DatabaseSync, msgId: string, imageUrl: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO attachments (msg_id, kind, remote_url, created_at) VALUES (?, 'sticker', ?, ?)`,
  ).run(msgId, imageUrl, new Date().toISOString());
}
