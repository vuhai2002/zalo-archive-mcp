import type { ArchivedMessage } from "../../archive-api-types";
import { MessageReactionPill } from "./message-reaction-pill";
import { QuickReactionButton } from "./quick-reaction-button";

/**
 * Dải dưới bong bóng như Zalo: viên cảm xúc (nếu có) đè mép dưới bên phải, nút Thích ngay cạnh khi rê chuột vào tin.
 * Tin chưa có cảm xúc: nút Thích nằm đè mép mà không chiếm chỗ, để tin không bị đẩy xa nhau.
 */
export function MessageReactionRow({ reactions, onReact }: { reactions: ArchivedMessage["reactions"]; onReact?: (code: string) => void }) {
  if (reactions.length > 0) {
    return (
      <div className="relative z-10 -mt-2 mr-1.5 flex items-center gap-1 self-end">
        <MessageReactionPill reactions={reactions} />
        {onReact && <QuickReactionButton onReact={onReact} />}
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
