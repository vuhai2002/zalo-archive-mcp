import type { DatabaseSync } from "node:sqlite";

/**
 * "Gửi ngay" một tin lẻ đang hẹn giờ (nút trên trang Hàng đợi): dời giờ hẹn về BÂY GIỜ, daemon thấy tới hạn ở lượt kế (nửa
 * giây) và gửi như mọi tin khác - vẫn qua cổng gửi, khóa khẩn cấp vẫn chặn. Đặt `not_before` = bây giờ chứ không xóa: vòng
 * gửi tính độ trễ từ mốc này, xóa thì mốc lùi về lúc tạo tin (hẹn trước nhiều ngày sẽ bị coi là quá hạn và bỏ).
 * Chỉ tin lẻ (`single`) đã duyệt, giờ hẹn còn ở tương lai; tin lô gửi theo nhịp và khung giờ riêng nên không áp dụng.
 */
export function sendScheduledNow(db: DatabaseSync, id: number, now: Date = new Date()): boolean {
  const iso = now.toISOString();
  const r = db
    .prepare(
      `UPDATE outbox SET not_before = ?, deferred_until = NULL
       WHERE id = ? AND status = 'approved' AND mode = 'single' AND not_before IS NOT NULL AND not_before > ?`,
    )
    .run(iso, id, iso);
  return Number(r.changes) === 1;
}
