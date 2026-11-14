import type { ListenerGap } from "../storage/connection-event-store.js";

/** Chữ cho kết quả lấy bù của một khoảng (đã gắn bởi `annotateGapsWithBackfill`) */
function backfillText(g: ListenerGap): string {
  const inGap = `kho có ${g.messagesInGap ?? 0} tin trong khoảng này`;
  if (g.backfill === "filled") return ` - ĐÃ LẤY BÙ ĐỦ (Zalo gửi lại ${g.backfillItems ?? 0} tin; ${inGap})`;
  if (g.backfill === "incomplete") {
    return ` - CÓ THỂ THIẾU TIN: ${g.backfillDetail ?? "lấy bù dừng dở"}; ${inGap}. Lấy lại bằng đồng bộ từ điện thoại trên dashboard`;
  }
  if (g.backfill === "unknown") return ` - chưa rõ đã lấy bù đủ chưa (${inGap})`;
  return "";
}

/**
 * Phần "khoảng KHÔNG nghe" của sync_status: mỗi khoảng ghi lúc nào, vì sao, và Zalo đã gửi bù đủ chưa. Trước đây mọi khoảng
 * bị gọi chung là "tin có thể thiếu", nên một khoảng máy ngủ đã lấy bù đủ vẫn bị hiểu là thiếu tin.
 */
export function describeListenerGaps(gaps: ListenerGap[], t: (iso: string | null) => string, lookbackDays: number): string {
  if (gaps.length === 0) return `Không có khoảng thủng nào được ghi nhận trong ${lookbackDays} ngày.`;
  const n = (s: ListenerGap["backfill"]) => gaps.filter((g) => g.backfill === s).length;
  const lines = gaps.map(
    (g) =>
      `  - ${t(g.from)} -> ${g.to ? t(g.to) : "HIỆN VẪN CHƯA NỐI LẠI"}` +
      (g.closeCode !== null ? ` (mã ${g.closeCode})` : "") +
      (g.asleep ? " (máy ngủ / daemon bị treo)" : "") +
      (g.suspected ? " (heartbeat đã cũ - nhiều khả năng daemon không chạy)" : "") +
      backfillText(g),
  );
  return (
    `Khoảng KHÔNG nghe trong ${lookbackDays} ngày - ${n("filled")} khoảng đã lấy bù đủ, ${n("incomplete")} khoảng có thể thiếu tin, ` +
    `${n("unknown")} khoảng chưa rõ (khoảng trước khi kho ghi kết quả lấy bù, hay nối lại liền không xin bù):\n${lines.join("\n")}`
  );
}
