import type { ArchivedMessage } from "../../archive-api-types";

/**
 * Cảm xúc trên một tin, như Zalo: viên nhỏ (dải `MessageReactionRow` đặt đè mép dưới bên phải bong bóng), hiện tối
 * đa 3 loại cảm xúc nhiều nhất + tổng số lần bấm, kể cả 1 như Zalo PC (bấm tim 3 lần = ❤️ 3). Rê chuột xem ai thả cái gì.
 */
export function MessageReactionPill({ reactions }: { reactions: ArchivedMessage["reactions"] }) {
  if (reactions.length === 0) return null;
  const total = reactions.reduce((n, r) => n + r.count, 0);
  const top = [...reactions].sort((a, b) => b.count - a.count).slice(0, 3);
  const title = reactions.map((r) => `${r.emoji ?? r.icon} ${r.count}: ${r.names.join(", ")}`).join("  ·  ");
  return (
    <div
      title={title}
      className="flex items-center gap-0.5 rounded-full border border-black/10 bg-bubble px-1.5 py-px text-[12px] leading-5 shadow-sm dark:border-white/10"
    >
      {top.map((r) => (
        <span key={r.icon} className={r.emoji ? "" : "text-[10px] text-chat-time"}>
          {r.emoji ?? r.icon}
        </span>
      ))}
      <span className="ml-0.5 text-[11px] text-chat-time">{total}</span>
    </div>
  );
}
