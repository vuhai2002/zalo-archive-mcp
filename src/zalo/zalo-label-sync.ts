import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import { normalizeZaloLabels, replaceZaloLabels } from "../storage/zalo-label-store.js";

/**
 * Đồng bộ thẻ Phân loại (getLabels - lệnh CHỈ ĐỌC, một lời gọi như Zalo PC làm lúc mở), chạy cùng lượt đồng bộ danh sách bạn
 * bè. Dùng để chọn nhanh hội thoại cho chế độ trình chiếu trên dashboard. Lỗi thì giữ bộ thẻ cũ.
 */
export async function syncZaloLabels(api: API, db: DatabaseSync, log: Logger): Promise<void> {
  try {
    const r = await api.getLabels();
    const labels = normalizeZaloLabels(r?.labelData);
    replaceZaloLabels(db, labels);
    log.info({ labels: labels.length }, "Đã đồng bộ thẻ Phân loại");
  } catch (err) {
    log.warn({ err }, "Không lấy được thẻ Phân loại (giữ dữ liệu cũ)");
  }
}
