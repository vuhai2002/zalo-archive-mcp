import { useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { RichMessageText } from "./rich-message-text";

/**
 * Tin link như Zalo: chữ của tin đầy đủ (link trong chữ bấm được; chỉ dán link thì là link xanh), bên dưới là thẻ xem
 * trước - ảnh, tên trang, mô tả, tên miền - bấm vào mở link. Link đã lọc http(s), ảnh đã lọc https CDN Zalo ở máy chủ;
 * mở tab mới, không gửi Referer. Ảnh giữ chỗ đúng tỉ lệ, tải xong báo `onMediaLoad` để khung chat bám đáy.
 */
export function MessageLinkCard({ link, onMediaLoad }: { link: NonNullable<ArchivedMessage["link"]>; onMediaLoad?: () => void }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = link.thumbUrl && !thumbFailed ? link.thumbUrl : null;
  const hasCard = !!(thumb || link.title || link.description);
  return (
    <div className="min-w-0 space-y-2">
      <RichMessageText text={link.text} styles={[]} />
      {hasCard ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={link.url}
          className="block max-w-[420px] overflow-hidden rounded-lg border border-black/10 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          {thumb && (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={onMediaLoad}
              onError={() => setThumbFailed(true)}
              style={{ aspectRatio: link.thumbAspect ?? undefined }}
              className="block max-h-[240px] w-full bg-tile object-cover"
            />
          )}
          <div className="space-y-0.5 px-3 py-2">
            {link.title && <div className="line-clamp-2 font-semibold text-chat-ink [overflow-wrap:anywhere]">{link.title}</div>}
            {link.description && <div className="line-clamp-3 text-[13.5px] text-chat-time [overflow-wrap:anywhere]">{link.description}</div>}
            <div className="text-[13px] text-[#0068ff] dark:text-zalo-600">{link.domain}</div>
          </div>
        </a>
      ) : (
        <div className="text-[13px] text-[#0068ff] dark:text-zalo-600">{link.domain}</div>
      )}
    </div>
  );
}
