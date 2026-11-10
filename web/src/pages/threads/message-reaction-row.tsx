import type { ArchivedMessage } from "../../archive-api-types";
import { MessageReactionPill } from "./message-reaction-pill";
import { QUICK_REACTIONS, QuickReactionButton } from "./quick-reaction-button";

/**
 * Cảm xúc mình đã thả trên tin (loại thả sau cùng, trong 6 cảm xúc nhanh): Zalo PC hiện nó trên nút cảm xúc thay cho 👍,
 * luôn hiện, bấm là thả thêm đúng loại đó. Không có thì null.
 */
export function myQuickReaction(reactions: ArchivedMessage["reactions"]): (typeof QUICK_REACTIONS)[number] | null {
  for (const r of [...reactions].reverse()) {
    const quick = r.mine ? QUICK_REACTIONS.find((q) => q.code === r.icon) : undefined;
    if (quick) return quick;
  }
  return null;
}

/**
 * Dải dưới bong bóng như Zalo: viên cảm xúc (nếu có) đè mép dưới bên phải, nút Thích ngay cạnh khi rê chuột vào tin.
 * Tin chưa có cảm xúc: nút Thích nằm đè mép mà không chiếm chỗ, để tin không bị đẩy xa nhau.
 */
export function MessageReactionRow({ reactions, onReact }: { reactions: ArchivedMessage["reactions"]; onReact?: (code: string) => void }) {
  if (reactions.length > 0) {
    return (
      <div className="relative z-10 -mt-2 mr-1.5 flex items-center gap-1 self-end">
        <MessageReactionPill reactions={reactions} />
        {onReact && <QuickReactionButton onReact={onReact} mine={myQuickReaction(reactions)} />}
      </div>
    );
  }
  if (!onReact) return null;
  return (
    <div className="relative z-10 h-0 self-end">
      <div className="absolute -top-3 right-1.5">
        <QuickReactionButton onReact={onReact} />
      </div>
    </div>
  );
}
