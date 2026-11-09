import { IconClock } from "../../shared/action-and-media-icons";
import { IconClose } from "../../shared/dashboard-icons";
import { replyTargetText } from "./composer-reply-strip";
import type { PendingOutgoing } from "./use-pending-outgoing";

/**
 * Bong bóng tạm của tin vừa gõ trên dashboard, cuối khung chat như Zalo: hiện ngay khi bấm gửi, mờ nhẹ + đồng hồ nhỏ
 * trong lúc chờ Zalo; tin thật vào kho thì thay chỗ. Gửi hỏng thì báo đỏ kèm lý do, bấm X để bỏ.
 */
export function PendingOutgoingBubbles({ items, onDismiss }: { items: PendingOutgoing[]; onDismiss: (id: number) => void }) {
  return (
    <>
      {items.map((p) => (
        <div key={p.item.id} className="mt-1 flex justify-end">
          <div className="flex min-w-0 max-w-[85%] flex-col items-end lg:max-w-[78%]">
            <div
              className={`min-w-0 max-w-full rounded-lg border px-3.5 py-2.5 text-[15px] leading-[1.5] text-chat-ink ${
                p.failed ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-bubble-self-line bg-bubble-self opacity-75"
              }`}
            >
              {p.quote && (
                <div className="mb-1.5 rounded-md border-l-2 border-zalo-500 bg-black/[0.04] px-2 py-1 text-[12.5px] dark:bg-white/5">
                  <div className="font-semibold">{p.quote.senderName?.trim() || (p.quote.isSelf ? "Bạn" : "Tin nhắn")}</div>
                  <div className="truncate text-chat-time">{replyTargetText(p.quote)}</div>
                </div>
              )}
              <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{p.text}</div>
              {!p.failed && (
                <div className="mt-1 flex justify-end text-chat-time" title="Đang gửi">
                  <IconClock size={12} />
                </div>
              )}
            </div>
            {p.failed && (
              <div className="mt-1 flex items-center gap-1 text-[12px] text-red-600 dark:text-red-400">
                <span className="[overflow-wrap:anywhere]">Không gửi được: {p.failed}</span>
                <button type="button" onClick={() => onDismiss(p.item.id)} aria-label="Bỏ tin không gửi được" className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-950/50">
                  <IconClose size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
