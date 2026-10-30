import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { replaceContactAliases, type ContactAlias } from "../storage/contact-alias-store.js";

const PAGE_SIZE = 100;
/** Chặn vòng lặp vô hạn nếu Zalo trả trang đầy mãi: 50 trang = 5000 tên gợi nhớ */
const MAX_PAGES = 50;

/**
 * Đồng bộ tên gợi nhớ (alias) mình đặt cho người khác, chạy cùng lượt đồng bộ danh sách bạn bè (như
 * Zalo Web làm lúc mở). Lấy đủ các trang rồi mới thay cả bộ; hỏng giữa chừng thì giữ dữ liệu cũ.
 */
export async function syncContactAliases(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  try {
    const all: ContactAlias[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await api.getAliasList(PAGE_SIZE, page);
      const items = Array.isArray(r?.items) ? r.items : [];
      for (const it of items) {
        const userId = String(it?.userId ?? "");
        const alias = typeof it?.alias === "string" ? it.alias.trim() : "";
        if (/^\d+$/.test(userId) && alias) all.push({ userId, alias });
      }
      if (items.length < PAGE_SIZE) break;
    }
    log.info({ aliases: replaceContactAliases(db, all) }, "Đã đồng bộ tên gợi nhớ");
  } catch (err) {
    log.warn({ err }, "Không lấy được tên gợi nhớ (giữ dữ liệu cũ)");
  }
}
