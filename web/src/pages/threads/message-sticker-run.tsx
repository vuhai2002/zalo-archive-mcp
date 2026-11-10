import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { sameOriginUrl } from "../../shared/same-origin-media-url";
import { canReact, type MessageActions } from "./message-action-rules";
import { MessageAttachmentView } from "./message-attachment-view";
import { MessageHoverActions } from "./message-hover-actions";
import { MessageReactionRow } from "./message-reaction-row";
import { STICKERS_PER_ROW } from "./sticker-run-grouping";

/**
 * Cụm sticker gửi liền nhau, như Zalo PC: hàng ngang tối đa 3 cái (sticker cách nhau 8px, hàng cách nhau 4px; màn hẹp thu
 * còn 96px để vẫn vừa 3 cái). Mỗi sticker vẫn là một tin riêng: cảm xúc của nó nằm dưới góc phải nó, rê chuột vào sticker nào
 * thì nút Thích hiện ở sticker đó và Trả lời / Chuyển tiếp / Thêm hiện cạnh hàng đó, làm việc với đúng sticker đó.
 * Cha (MessageBubble) có lớp `group` nên các nút chỉ hiện khi rê chuột vào cụm.
 */
export function MessageStickerRun({
  stickers,
  self,
  actions,
  onMediaLoad,
}: {
  stickers: ArchivedMessage[];
  self: boolean;
  actions?: MessageActions;
  onMediaLoad: () => void;
}) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const rows: ArchivedMessage[][] = [];
  for (let i = 0; i < stickers.length; i += STICKERS_PER_ROW) rows.push(stickers.slice(i, i + STICKERS_PER_ROW));

  return (
    <div className={`flex flex-col gap-1 ${self ? "items-end" : "items-start"}`}>
      {rows.map((row) => {
        const hovered = row.find((m) => m.id === hoverId);
        return (
          <div key={row[0]!.id} className={`flex items-center gap-2 ${self ? "flex-row-reverse" : ""}`}>
            <div className="flex items-start gap-2">
              {row.map((m) => (
                <StickerCell key={m.id} msg={m} hovered={m.id === hoverId} actions={actions} onHover={() => setHoverId(m.id)} onMediaLoad={onMediaLoad} />
              ))}
            </div>
            {/* key theo tin: sang sticker khác thì menu Thêm của sticker trước đóng lại */}
            {actions && hovered && <MessageHoverActions key={hovered.id} msg={hovered} album={null} actions={actions} self={self} />}
          </div>
        );
      })}
    </div>
  );
}

function StickerCell({
  msg,
  hovered,
  actions,
  onHover,
  onMediaLoad,
}: {
  msg: ArchivedMessage;
  hovered: boolean;
  actions?: MessageActions;
  onHover: () => void;
  onMediaLoad: () => void;
}) {
  const att = msg.attachments[0]!;
  const url = sameOriginUrl(att.url);
  const react = actions?.react;
  // Nút Thích chỉ ở sticker đang rê chuột (cả hàng chung một vùng rê chuột của cụm)
  const onReact = hovered && react && canReact(msg) ? (code: string) => react(msg, code) : undefined;
  return (
    <div onMouseEnter={onHover} className="flex flex-col">
      {url ? (
        <img src={url} alt="Sticker" loading="lazy" onLoad={onMediaLoad} className="h-24 w-24 object-contain sm:h-32 sm:w-32" />
      ) : (
        <MessageAttachmentView att={att} onMediaLoad={onMediaLoad} />
      )}
      <MessageReactionRow reactions={msg.reactions} onReact={onReact} />
    </div>
  );
}
