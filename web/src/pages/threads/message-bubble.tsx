import type { ArchivedMessage } from "../../archive-api-types";
import { sourceLabel } from "../../shared/archive-status-labels";
import { formatClock, formatDateTime } from "../../shared/format-archive-time";
import { ContactAvatar } from "../../shared/contact-avatar";
import { MessageAttachmentView } from "./message-attachment-view";

/**
 * Một tin trong khung hội thoại. Chữ và tên đều do người khác gửi tới nên chỉ
 * render dạng văn bản thuần (`whitespace-pre-wrap`), không HTML, không tự biến
 * link thành thẻ `<a>` - tin lạ không được đặt được thứ gì bấm vào trên dashboard.
 */
export function MessageBubble({
  msg,
  isGroup,
  quoted,
  timeZone,
  onMediaLoad,
}: {
  msg: ArchivedMessage;
  isGroup: boolean;
  /** Tin được trích dẫn nếu đang có trong danh sách đã tải; không có thì chỉ hiện dấu "trả lời" */
  quoted: ArchivedMessage | undefined;
  timeZone: string;
  onMediaLoad: () => void;
}) {
  const self = msg.isSelf;
  const recalled = msg.recalledAt !== null;
  // Sticker đã có ảnh: hiện ảnh trần như Zalo, bỏ khung bong bóng và chữ "[sticker]"
  const bareSticker = msg.msgType === "chat.sticker" && msg.attachments.some((a) => a.kind === "sticker" && a.status === "done");
  const hasText = !bareSticker && msg.text.trim().length > 0;
  const showSender = isGroup && !self;

  return (
    <div className={`flex items-end gap-2 ${self ? "justify-end" : "justify-start"}`}>
      {showSender && (
        <span className="mb-5 shrink-0">
          <ContactAvatar name={msg.senderName?.trim() || msg.senderId} seed={msg.senderId} url={msg.senderAvatarUrl} size="sm" />
        </span>
      )}
      <div className={`flex min-w-0 max-w-[88%] flex-col sm:max-w-[72%] ${self ? "items-end" : "items-start"}`}>
        {showSender && (
          <div className="mb-0.5 max-w-full truncate px-1 text-[12px] font-medium text-zalo-600">
            {msg.senderName?.trim() ? msg.senderName : msg.senderId}
          </div>
        )}

        <div
          className={`min-w-0 max-w-full space-y-2 text-[14px] leading-relaxed ${
            bareSticker
              ? ""
              : `rounded-2xl px-3.5 py-2 ${self ? "rounded-br-md bg-zalo-500 text-white" : "rounded-bl-md border border-line bg-surface text-ink"}`
          } ${recalled ? "opacity-70 outline-1 outline-dashed outline-red-400" : ""}`}
        >
          {msg.quoteMsgId && (
            <div
              className={`border-l-2 pl-2 text-[12px] ${self ? "border-white/60 text-white/85" : "border-zalo-500 text-ink-soft"}`}
            >
              {quoted ? (
                <>
                  <span className="font-medium">
                    Trả lời {quoted.isSelf ? "tôi" : quoted.senderName?.trim() || quoted.senderId}:
                  </span>{" "}
                  <span className="line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{quoted.text}</span>
                </>
              ) : (
                <span className="italic">Trả lời một tin (chưa tải trong khung này)</span>
              )}
            </div>
          )}

          {msg.attachments.map((att) => (
            <MessageAttachmentView key={att.id} att={att} onMediaLoad={onMediaLoad} />
          ))}

          {hasText && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.text}</p>}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-ink-soft">
          <span title={formatDateTime(msg.sentAt, timeZone)} className="tabular-nums">
            {formatClock(msg.sentAt, timeZone)}
          </span>
          {recalled && (
            <span className="font-medium text-red-600 dark:text-red-400" title={formatDateTime(msg.recalledAt, timeZone)}>
              đã thu hồi
            </span>
          )}
          {msg.source !== "live" && (
            <span className="rounded border border-line px-1 py-px" title="Tin vào kho bằng đường khác listener trực tiếp">
              {sourceLabel(msg.source)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
