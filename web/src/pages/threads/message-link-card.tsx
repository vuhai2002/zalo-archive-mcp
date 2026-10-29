import type { ArchivedMessage } from "../../archive-api-types";

/**
 * Thẻ link như Zalo: URL xanh bấm được, tiêu đề đậm, mô tả, tên miền xanh nhỏ ở dưới. Link đã lọc
 * http(s) ở máy chủ; mở tab mới, không gửi Referer.
 */
export function MessageLinkCard({ link }: { link: NonNullable<ArchivedMessage["link"]> }) {
  return (
    <div className="min-w-0 space-y-1">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={link.url}
        className="block text-[#0068ff] [overflow-wrap:anywhere] hover:underline dark:text-zalo-600"
      >
        {link.url}
      </a>
      {link.title && <div className="line-clamp-3 whitespace-pre-wrap font-semibold [overflow-wrap:anywhere]">{link.title}</div>}
      {link.description && <div className="line-clamp-2 whitespace-pre-wrap text-[13.5px] text-chat-time [overflow-wrap:anywhere]">{link.description}</div>}
      <div className="text-[13px] text-[#0068ff] dark:text-zalo-600">{link.domain}</div>
    </div>
  );
}
