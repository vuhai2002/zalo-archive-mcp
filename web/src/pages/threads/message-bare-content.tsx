import type { ReactNode } from "react";
import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import type { MessageActions } from "./message-action-rules";
import { MessageAlbumGrid } from "./message-album-grid";
import { MessageAttachmentView } from "./message-attachment-view";
import { MessageContactCard } from "./message-contact-card";
import { MessageReactionRow } from "./message-reaction-row";
import { MessageStickerRun } from "./message-sticker-run";
import { mergeAlbumReactions } from "./photo-album-grouping";

/**
 * Tin hiện TRẦN, không khung bong bóng, như Zalo PC: ảnh / gif / sticker / video không chữ, album ảnh (chú thích dưới khung
 * lưới), danh thiếp, cụm sticker gửi liền nhau. Trong nhóm, tên người gửi là viên nhỏ phía trên; giờ là viên nhỏ bên dưới.
 */
export function MessageBareContent({
  msg,
  album,
  stickers,
  self,
  name,
  clock,
  timeTitle,
  recalled,
  meta,
  actions,
  onReact,
  onMediaLoad,
  onMediaRetried,
  openOf,
}: {
  msg: ArchivedMessage;
  album: ArchivedMessage[] | null;
  stickers: ArchivedMessage[] | null;
  self: boolean;
  /** Tên người gửi (tin đầu cụm trong nhóm); null = không hiện */
  name: string | null;
  /** Giờ "21:03" ở tin cuối cụm; null = không hiện */
  clock: string | null;
  timeTitle: string;
  recalled: boolean;
  meta: ReactNode;
  actions?: MessageActions;
  onReact?: (code: string) => void;
  onMediaLoad: () => void;
  onMediaRetried: () => void;
  openOf: (att: AttachmentInfo) => (() => void) | undefined;
}) {
  const albumCaption = album ? album.map((m) => m.text.trim()).filter(Boolean).join("\n") : "";
  return (
    <>
      {name && <div className="mb-1 rounded-full bg-bubble px-2.5 py-0.5 text-[12px] text-chat-time shadow-sm">{name}</div>}
      <div className={`space-y-1 ${recalled ? "opacity-70" : ""}`}>
        {stickers ? (
          <MessageStickerRun stickers={stickers} self={self} actions={actions} onMediaLoad={onMediaLoad} />
        ) : msg.contactCard ? (
          <MessageContactCard card={msg.contactCard} messageId={msg.id} />
        ) : album ? (
          <MessageAlbumGrid album={album} onMediaLoad={onMediaLoad} onMediaRetried={onMediaRetried} />
        ) : (
          msg.attachments.map((att) => (
            <MessageAttachmentView key={att.id} att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} onOpen={openOf(att)} video={msg.video} />
          ))
        )}
      </div>
      {albumCaption && (
        <div className="mt-1 max-w-[450px] whitespace-pre-wrap rounded-lg border border-black/5 bg-bubble px-3 py-2 text-[14.5px] leading-[1.45] text-chat-ink dark:border-white/5">
          {albumCaption}
        </div>
      )}
      {/* Cụm sticker: cảm xúc nằm dưới từng sticker */}
      {!stickers && <MessageReactionRow reactions={album ? mergeAlbumReactions(album) : msg.reactions} onReact={onReact} />}
      {clock && (
        <span title={timeTitle} className="mt-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] tabular-nums text-white dark:bg-white/15">
          {clock}
        </span>
      )}
      {recalled && <div className="px-1">{meta}</div>}
    </>
  );
}
