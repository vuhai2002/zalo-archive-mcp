import type { ArchivedMessage, AttachmentInfo, TextStyleSpan } from "../../archive-api-types";
import { sourceLabel } from "../../shared/archive-status-labels";
import { ContactAvatar } from "../../shared/contact-avatar";
import { formatClock, formatDateTime } from "../../shared/format-archive-time";
import { MessageAlbumGrid } from "./message-album-grid";
import { MessageAttachmentView } from "./message-attachment-view";
import { MessageCallCard } from "./message-call-card";
import { useMediaViewer } from "./media-viewer-context";
import { viewerItemFromMessage } from "./media-viewer-items";
import { MessageLinkCard } from "./message-link-card";
import { MessageReactionPill } from "./message-reaction-pill";
import { isSystemMessage } from "./message-grouping";
import { mergeAlbumReactions } from "./photo-album-grouping";
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
 * - tin hệ thống (vd đã đồng ý kết bạn) nằm giữa khung.
 * Chữ do người khác gửi: chỉ dựng từ chữ thuần + định dạng đã lọc, không HTML.
 */
export function MessageBubble({
  msg,
  isGroup,
  quoted,
  timeZone,
  first,
  last,
  onMediaLoad,
  onMediaRetried,
  album = null,
}: {
  msg: ArchivedMessage;
  /** Album ảnh (đã gộp, xếp theo vị trí): hiện khung lưới thay cho ảnh lẻ của `msg` */
  album?: ArchivedMessage[] | null;
  isGroup: boolean;
  /** Tin được trích dẫn nếu đang có trong danh sách đã tải; không có thì chỉ hiện dấu "trả lời" */
  quoted: ArchivedMessage | undefined;
  timeZone: string;
  first: boolean;
  last: boolean;
  onMediaLoad: () => void;
  /** Vừa bấm Thử lại trên một file hỏng */
  onMediaRetried: () => void;
}) {
  const self = msg.isSelf;
  // Bấm ảnh / video: mở cửa sổ xem của hội thoại (ngoài khung chat thì không có, ảnh mở thẻ mới)
  const viewer = useMediaViewer();
  const openOf = (att: AttachmentInfo) => {
    const item = viewer ? viewerItemFromMessage(msg, att) : null;
    return item ? () => viewer?.open(item) : undefined;
  };
  const recalled = msg.recalledAt !== null;
  const name = msg.senderName?.trim() || msg.senderId;
  const timeTitle = `${formatDateTime(msg.sentAt, timeZone)}${msg.source !== "live" ? ` · ${sourceLabel(msg.source)}` : ""}`;

  if (isSystemMessage(msg)) {
    return (
      <div className="my-3 flex justify-center" title={timeTitle}>
        <span className="max-w-[85%] rounded-full bg-bubble px-3 py-1 text-center text-[12.5px] text-chat-time shadow-sm">
          {msg.text}
        </span>
      </div>
    );
  }

  const hasSticker = msg.msgType === "chat.sticker" && msg.attachments.some((a) => a.kind === "sticker" && a.status === "done");
  const hasText = !hasSticker && msg.text.trim().length > 0;
  // Ảnh / gif / sticker không chữ, không trích dẫn: hiện trần như Zalo, không khung bong bóng.
  // Album luôn hiện trần; chú thích (nếu có) nằm dưới khung lưới
  const bare =
    !!album || (!hasText && !msg.quoteMsgId && msg.attachments.length > 0 && msg.attachments.every((a) => VISUAL_KINDS.has(a.kind)));
  const albumCaption = album ? album.map((m) => m.text.trim()).filter(Boolean).join("\n") : "";
  const showName = isGroup && !self && first;
  const showMeta = last || recalled;

  const meta = (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-chat-time">
      {last && (
        <span title={timeTitle} className="tabular-nums">
          {formatClock(msg.sentAt, timeZone)}
        </span>
      )}
      {recalled && (
        <span className="font-medium text-red-600 dark:text-red-400" title={`Thu hồi lúc ${formatDateTime(msg.recalledAt, timeZone)}`}>
          Đã thu hồi
        </span>
      )}
    </div>
  );

  return (
    <div className={`flex gap-2 ${self ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-1"}`}>
      {!self && (
        <div className="w-8 shrink-0">
          {first && <ContactAvatar name={name} seed={msg.senderId} url={msg.senderAvatarUrl} size="sm" />}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[85%] flex-col lg:max-w-[78%] ${self ? "items-end" : "items-start"}`}>
        {bare ? (
          <>
            {/* Ảnh trong nhóm: tên người gửi trong một viên nhỏ phía trên ảnh, như Zalo PC */}
            {showName && <div className="mb-1 rounded-full bg-bubble px-2.5 py-0.5 text-[12px] text-chat-time shadow-sm">{name}</div>}
            <div className={`space-y-1 ${recalled ? "opacity-70" : ""}`}>
              {album ? (
                <MessageAlbumGrid album={album} onMediaLoad={onMediaLoad} onMediaRetried={onMediaRetried} />
              ) : (
                msg.attachments.map((att) => (
                  <MessageAttachmentView key={att.id} att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} onOpen={openOf(att)} video={msg.video} />
                ))
              )}
            </div>
            {albumCaption && (
              <div className="mt-1 max-w-[360px] whitespace-pre-wrap rounded-lg border border-black/5 bg-bubble px-3 py-2 text-[14.5px] leading-[1.45] text-chat-ink dark:border-white/5">
                {albumCaption}
              </div>
            )}
            <MessageReactionPill reactions={album ? mergeAlbumReactions(album) : msg.reactions} />
            {last && (
              <span title={timeTitle} className="mt-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] tabular-nums text-white dark:bg-white/15">
                {formatClock(msg.sentAt, timeZone)}
              </span>
            )}
            {recalled && <div className="px-1">{meta}</div>}
          </>
        ) : (
          <div
            className={`min-w-0 max-w-full rounded-lg px-3.5 py-2.5 text-[15px] leading-[1.5] text-chat-ink ${
              self ? "border border-bubble-self-line bg-bubble-self" : "border border-black/5 bg-bubble shadow-[0_1px_1px_rgba(0,0,0,0.05)] dark:border-white/5"
            } ${recalled ? "opacity-75" : ""}`}
          >
            {showName && <div className="mb-1 text-[12px] text-chat-time">{name}</div>}
            {msg.quoteMsgId && (
              <div className="mb-1.5 rounded-md border-l-2 border-zalo-500 bg-black/[0.04] px-2 py-1 text-[12.5px] dark:bg-white/5">
                {quoted ? (
                  <>
                    <div className="font-semibold">{quoted.isSelf ? "Bạn" : quoted.senderName?.trim() || quoted.senderId}</div>
                    <div className="line-clamp-2 whitespace-pre-wrap text-chat-time [overflow-wrap:anywhere]">{quoted.text}</div>
                  </>
                ) : (
                  <span className="italic text-chat-time">Trả lời một tin (chưa tải trong khung này)</span>
                )}
              </div>
            )}
            {msg.attachments.length > 0 && (
              <div className={`space-y-1.5 ${hasText ? "mb-1.5" : ""}`}>
                {msg.attachments.map((att) => (
                  <MessageAttachmentView key={att.id} att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} onOpen={openOf(att)} video={msg.video} />
                ))}
              </div>
            )}
            {msg.link ? (
              <MessageLinkCard link={msg.link} />
            ) : msg.call ? (
              <MessageCallCard text={msg.text} missed={msg.call.missedIncoming} />
            ) : (
              hasText && <RichMessageText text={msg.text} styles={textStylesOf(msg)} />
            )}
            {showMeta && meta}
          </div>
        )}
        {!bare && <MessageReactionPill reactions={msg.reactions} />}
      </div>
    </div>
  );
}
