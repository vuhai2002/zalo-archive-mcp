import { useState } from "react";
import type { ArchivedMessage, AttachmentInfo, TextStyleSpan } from "../../archive-api-types";
import { sourceLabel } from "../../shared/archive-status-labels";
import { ContactAvatar } from "../../shared/contact-avatar";
import { formatClock, formatDateTime } from "../../shared/format-archive-time";
import { MessageAttachmentView } from "./message-attachment-view";
import { MessageBareContent } from "./message-bare-content";
import { MessageCallCard } from "./message-call-card";
import { MessageQuoteBlock } from "./message-quote-block";
import { RecalledNote, RecalledShownLabel } from "./message-recalled-note";
import { useMediaViewer } from "./media-viewer-context";
import { viewerItemFromMessage } from "./media-viewer-items";
import { hasLinkCard, LINK_BUBBLE_WIDTH_CLASS, MessageLinkCard } from "./message-link-card";
import { MessageReactionRow } from "./message-reaction-row";
import { canReact, type MessageActions } from "./message-action-rules";
import { MessageHoverActions } from "./message-hover-actions";
import { SystemMessageView } from "./message-system-notice";
import { isCaptionedPhoto, MessagePhotoCaptionBubble } from "./message-photo-caption-bubble";
import { isSystemMessage } from "./message-grouping";
import { RichMessageText } from "./rich-message-text";

// Video cũng hiện trần (không khung bong bóng) như Zalo PC
const VISUAL_KINDS = new Set(["photo", "gif", "sticker", "video"]);

/** Thẻ thông báo của Zalo (vd đăng nhập trên máy tính): dòng đầu là tiêu đề, in đậm như trên Zalo */
function textStylesOf(msg: ArchivedMessage): TextStyleSpan[] {
  if (msg.msgType !== "chat.list.action") return msg.textStyles;
  const end = msg.text.indexOf("\n");
  return [{ start: 0, end: end === -1 ? msg.text.length : end, bold: true, italic: false, underline: false, strike: false, color: null, size: null }];
}

/**
 * Một tin trong khung chat, trình bày như Zalo:
 * - tin mình bên phải nền xanh nhạt, tin người khác bên trái nền trắng;
 * - avatar (và tên, trong nhóm) chỉ ở tin ĐẦU cụm, giờ chỉ ở tin CUỐI cụm;
 * - ảnh / gif / sticker không kèm chữ thì hiện trần, giờ là viên nhỏ bên dưới;
 * - tin hệ thống (vd đã đồng ý kết bạn) nằm giữa khung;
 * - tin đã thu hồi hiện "Tin nhắn đã được thu hồi", bấm con mắt mới hiện nội dung kho đã lưu.
 * Chữ do người khác gửi: chỉ dựng từ chữ thuần + định dạng đã lọc, không HTML.
 */
export function MessageBubble({
  msg,
  isGroup,
  timeZone,
  first,
  last,
  onMediaLoad,
  onMediaRetried,
  onJumpToMessage,
  actions,
  album = null,
  stickers = null,
}: {
  msg: ArchivedMessage;
  /** Album ảnh (đã gộp, xếp theo vị trí): hiện khung lưới thay cho ảnh lẻ của `msg` */
  album?: ArchivedMessage[] | null;
  /** Cụm sticker gửi liền nhau (từ 2 cái, `msg` là cái đầu): hiện hàng ngang 3 cái như Zalo PC */
  stickers?: ArchivedMessage[] | null;
  isGroup: boolean;
  timeZone: string;
  first: boolean;
  last: boolean;
  onMediaLoad: () => void;
  /** Vừa bấm Thử lại trên một file hỏng */
  onMediaRetried: () => void;
  /** Bấm ô trích dẫn: nhảy tới tin gốc */
  onJumpToMessage?: (id: number) => void;
  /** Thao tác khi rê chuột vào tin (Trả lời, Chuyển tiếp, Thêm). Không truyền = không hiện (đang chọn nhiều tin) */
  actions?: MessageActions;
}) {
  const [revealed, setRevealed] = useState(false);
  const self = msg.isSelf;
  // Bấm ảnh / video: mở cửa sổ xem của hội thoại (ngoài khung chat thì không có, ảnh mở thẻ mới)
  const viewer = useMediaViewer();
  const openOf = (att: AttachmentInfo) => {
    const item = viewer ? viewerItemFromMessage(msg, att) : null;
    return item ? () => viewer?.open(item) : undefined;
  };
  const recalled = msg.recalledAt !== null;
  // Tin đã thu hồi: mặc định giấu nội dung như Zalo
  const hidden = recalled && !revealed;
  const name = msg.senderName?.trim() || msg.senderId;
  // Giờ của mục là giờ tin CUỐI (cụm sticker kéo dài vài phút: giờ dưới cụm là của sticker cuối)
  const timeMsg = stickers?.at(-1) ?? msg;
  const timeTitle = `${formatDateTime(timeMsg.sentAt, timeZone)}${timeMsg.source !== "live" ? ` · ${sourceLabel(timeMsg.source)}` : ""}`;

  // Tin bình chọn có mã thì có nút Xem (+ thẻ bình chọn ở tin tạo); không đọc được mã thì hiện như thông báo thường
  if (isSystemMessage(msg)) return <SystemMessageView msg={msg} title={timeTitle} />;

  const hasSticker = msg.msgType === "chat.sticker" && msg.attachments.some((a) => a.kind === "sticker" && a.status === "done");
  const hasText = !hasSticker && msg.text.trim().length > 0;
  // Ảnh / gif / sticker không chữ, không trích dẫn: hiện trần như Zalo, không khung bong bóng.
  // Album luôn hiện trần; chú thích (nếu có) nằm dưới khung lưới
  // Danh thiếp cũng là khung riêng như Zalo, không nằm trong bong bóng
  const bare =
    !hidden &&
    (!!album ||
      !!stickers ||
      !!msg.contactCard ||
      (!hasText && !msg.quoteMsgId && msg.attachments.length > 0 && msg.attachments.every((a) => VISUAL_KINDS.has(a.kind))));
  const showName = isGroup && !self && first;
  // Ảnh kèm chú thích: một bong bóng, ảnh tràn sát mép trên như Zalo PC
  const captioned = !hidden && !bare && isCaptionedPhoto(msg, hasText);
  const showMeta = last || (recalled && revealed);
  // Cụm sticker tự vẽ nút cạnh hàng đang rê chuột, cho đúng sticker đó
  const hoverActions = actions && !stickers ? <MessageHoverActions msg={msg} album={album} actions={actions} self={self} /> : null;
  const react = actions?.react;
  const onReact = react && canReact(msg) ? (code: string) => react(msg, code) : undefined;

  const meta = (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-chat-time">
      {last && (
        <span title={timeTitle} className="tabular-nums">
          {formatClock(timeMsg.sentAt, timeZone)}
        </span>
      )}
      {recalled && revealed && (
        <RecalledShownLabel title={`Thu hồi lúc ${formatDateTime(msg.recalledAt, timeZone)}`} onHide={() => setRevealed(false)} />
      )}
    </div>
  );

  return (
    <div className={`group flex gap-2 ${self ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-1"}`}>
      {self && hoverActions}
      {!self && (
        <div className="w-10 shrink-0">
          {first && <ContactAvatar name={name} seed={msg.senderId} url={msg.senderAvatarUrl} size="chat" />}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[85%] flex-col lg:max-w-[78%] ${self ? "items-end" : "items-start"}`}>
        {bare ? (
          <MessageBareContent
            msg={msg}
            album={album}
            stickers={stickers}
            self={self}
            name={showName ? name : null}
            clock={last ? formatClock(timeMsg.sentAt, timeZone) : null}
            timeTitle={timeTitle}
            recalled={recalled}
            meta={meta}
            actions={actions}
            onReact={onReact}
            onMediaLoad={onMediaLoad}
            onMediaRetried={onMediaRetried}
            openOf={openOf}
          />
        ) : captioned ? (
          <MessagePhotoCaptionBubble
            msg={msg}
            self={self}
            name={showName ? name : null}
            meta={showMeta ? meta : null}
            textStyles={textStylesOf(msg)}
            dimmed={recalled && revealed}
            onMediaLoad={onMediaLoad}
            onMediaRetried={onMediaRetried}
            openOf={openOf}
          />
        ) : (
          <div
            className={`min-w-0 max-w-full rounded-lg px-3.5 py-2.5 text-[15px] leading-[1.5] text-chat-ink ${!hidden && hasLinkCard(msg.link) ? LINK_BUBBLE_WIDTH_CLASS : ""} ${
              self ? "border border-bubble-self-line bg-bubble-self" : "border border-black/5 bg-bubble shadow-[0_1px_1px_rgba(0,0,0,0.05)] dark:border-white/5"
            } ${recalled && revealed ? "opacity-75" : ""}`}
          >
            {showName && <div className="mb-1 text-[12px] text-chat-time">{name}</div>}
            {hidden ? (
              <RecalledNote onReveal={() => setRevealed(true)} />
            ) : (
              <>
                {msg.quoteMsgId && <MessageQuoteBlock quote={msg.quote} onJump={onJumpToMessage} />}
                {msg.attachments.length > 0 && (
                  <div className={`space-y-1.5 ${hasText ? "mb-1.5" : ""}`}>
                    {msg.attachments.map((att) => (
                      <MessageAttachmentView key={att.id} att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} onOpen={openOf(att)} video={msg.video} />
                    ))}
                  </div>
                )}
                {msg.link ? (
                  <MessageLinkCard link={msg.link} onMediaLoad={onMediaLoad} />
                ) : msg.call ? (
                  <MessageCallCard text={msg.text} missed={msg.call.missedIncoming} />
                ) : (
                  hasText && <RichMessageText text={msg.text} styles={textStylesOf(msg)} />
                )}
              </>
            )}
            {showMeta && meta}
          </div>
        )}
        {!bare && !hidden && <MessageReactionRow reactions={msg.reactions} onReact={onReact} />}
      </div>
      {!self && hoverActions}
    </div>
  );
}
