import type { ReactNode } from "react";
import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import { MessageAttachmentView } from "./message-attachment-view";
import { RichMessageText } from "./rich-message-text";

/** Tin ảnh có chú thích (không trích dẫn, không thẻ link / cuộc gọi): vẽ như Zalo PC thay vì ảnh lọt trong khung có lề */
export function isCaptionedPhoto(msg: ArchivedMessage, hasText: boolean): boolean {
  return (
    hasText &&
    !msg.quoteMsgId &&
    !msg.link &&
    !msg.call &&
    msg.attachments.length > 0 &&
    msg.attachments.every((a) => (a.kind === "photo" || a.kind === "gif") && a.status === "done")
  );
}

/**
 * Ảnh kèm chú thích như Zalo PC: MỘT bong bóng, ảnh tràn sát mép trên (bo theo góc bong bóng), chú thích + giờ bên dưới.
 * Bề ngang bong bóng theo ảnh: chữ chú thích xuống dòng trong bề ngang đó (`w-0 min-w-full`), không kéo bong bóng rộng ra.
 */
export function MessagePhotoCaptionBubble(p: {
  msg: ArchivedMessage;
  self: boolean;
  name: string | null;
  meta: ReactNode;
  textStyles: ArchivedMessage["textStyles"];
  dimmed: boolean;
  onMediaLoad: () => void;
  onMediaRetried: () => void;
  openOf: (att: AttachmentInfo) => (() => void) | undefined;
}) {
  const { msg } = p;
  return (
    <div
      className={`flex w-fit min-w-[220px] max-w-full flex-col overflow-hidden rounded-lg text-[15px] leading-[1.5] text-chat-ink ${
        p.self ? "border border-bubble-self-line bg-bubble-self" : "border border-black/5 bg-bubble shadow-[0_1px_1px_rgba(0,0,0,0.05)] dark:border-white/5"
      } ${p.dimmed ? "opacity-75" : ""}`}
    >
      {p.name && <div className="px-3.5 pt-2 text-[12px] text-chat-time">{p.name}</div>}
      <div className={`space-y-0.5 ${p.name ? "pt-1.5" : ""}`}>
        {msg.attachments.map((att) => (
          <MessageAttachmentView key={att.id} att={att} flush onMediaLoad={p.onMediaLoad} onRetried={p.onMediaRetried} onOpen={p.openOf(att)} />
        ))}
      </div>
      <div className="w-0 min-w-full px-3.5 pb-2.5 pt-2 [overflow-wrap:anywhere]">
        <RichMessageText text={msg.text} styles={p.textStyles} />
        {p.meta}
      </div>
    </div>
  );
}
