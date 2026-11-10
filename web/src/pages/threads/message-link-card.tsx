import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { RichMessageText } from "./rich-message-text";

/** Bong bóng tin có thẻ link rộng cố định như Zalo PC: ảnh 374px + lề 14px hai bên (đo từ ảnh chụp Zalo) */
export const LINK_BUBBLE_WIDTH_CLASS = "w-[404px]";

/** Tin link có thẻ xem trước (ảnh / tên trang / mô tả) - khi đó bong bóng rộng cố định như Zalo */
export const hasLinkCard = (link: ArchivedMessage["link"]) => !!(link && (link.thumbUrl || link.title || link.description));

/**
 * Tin link như Zalo PC: chữ của tin (link xanh, link quá dài rút gọn ở giữa), bên dưới là thẻ xem trước KHÔNG viền: ảnh
 * 16:9 bo góc, tên trang đậm một dòng, mô tả xám hai dòng, tên miền xanh - bấm vào mở link. Link đã lọc http(s), ảnh đã lọc
 * https CDN Zalo ở máy chủ; mở tab mới, không gửi Referer. Ảnh giữ chỗ đúng khung, tải xong báo `onMediaLoad` để khung chat
 * bám đáy.
 */
export function MessageLinkCard({ link, onMediaLoad }: { link: NonNullable<ArchivedMessage["link"]>; onMediaLoad?: () => void }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = link.thumbUrl && !thumbFailed ? link.thumbUrl : null;
  return (
    <div className="min-w-0 space-y-2">
      <RichMessageText text={link.text} styles={link.textStyles} />
      {hasLinkCard(link) ? (
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" title={link.url} className="group/card block">
          {thumb && (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={onMediaLoad}
              onError={() => setThumbFailed(true)}
              className="block aspect-video w-full rounded-lg bg-tile object-cover"
            />
          )}
          <div className={`space-y-0.5 ${thumb ? "mt-2.5" : ""}`}>
            {link.title && (
              <div className="truncate text-[15px] font-semibold leading-[22px] text-chat-ink group-hover/card:underline">{link.title}</div>
            )}
            {link.description && <div className="line-clamp-2 text-[14px] leading-5 text-chat-time [overflow-wrap:anywhere]">{link.description}</div>}
            <div className="text-[14px] leading-5 text-[#0068ff] dark:text-zalo-600">{link.domain}</div>
          </div>
        </a>
      ) : (
        <div className="text-[13px] text-[#0068ff] dark:text-zalo-600">{link.domain}</div>
      )}
    </div>
  );
}
