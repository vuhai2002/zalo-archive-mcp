import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { attachStickerImage, getStickerCatalog, pendingStickerMessages, saveStickerCatalog } from "../storage/sticker-store.js";

/** zca-js gọi một request cho MỖI sticker (song song), nên giới hạn số sticker mỗi lượt */
const MAX_NEW_STICKERS_PER_RUN = 10;
const PENDING_SCAN = 200;
const FAILED_RETRY_MS = 24 * 3_600_000;

/**
 * Gắn ảnh cho các tin sticker chưa có ảnh: sticker đã biết thì dùng ngay ảnh trong
 * catalog, sticker mới thì hỏi Zalo (`getStickersDetail`, như deplao làm). Ảnh động
 * (webp) được ưu tiên vì giữ đúng hình Zalo hiện.
 */
export async function resolveStickerImages(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  const pending = pendingStickerMessages(db, PENDING_SCAN);
  if (pending.length === 0) return;

  const catalog = getStickerCatalog(db, pending.map((p) => p.stickerId));
  const retryBefore = Date.now() - FAILED_RETRY_MS;
  const toFetch = [...new Set(pending.map((p) => p.stickerId))]
    .filter((id) => {
      const c = catalog.get(id);
      return !c || (c.status === "failed" && Date.parse(c.fetchedAt) < retryBefore);
    })
    .slice(0, MAX_NEW_STICKERS_PER_RUN);

  if (toFetch.length > 0) {
    try {
      const details = await api.getStickersDetail(toFetch);
      const byId = new Map(details.map((d) => [Number(d.id), d]));
      for (const id of toFetch) {
        const d = byId.get(id);
        const url = d?.stickerWebpUrl || d?.stickerUrl || null;
        saveStickerCatalog(db, id, url);
        catalog.set(id, { imageUrl: url, status: url ? "ok" : "failed", fetchedAt: new Date().toISOString() });
      }
    } catch (err) {
      log.warn({ err, count: toFetch.length }, "Không lấy được ảnh sticker");
      for (const id of toFetch) saveStickerCatalog(db, id, null);
    }
  }

  let attached = 0;
  for (const p of pending) {
    const url = catalog.get(p.stickerId)?.imageUrl;
    if (url) {
      attachStickerImage(db, p.msgId, url);
      attached++;
    }
  }
  if (attached > 0) log.info({ attached }, "Đã gắn ảnh sticker vào tin");
}
