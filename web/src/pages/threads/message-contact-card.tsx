import { useState } from "react";
import { Link } from "react-router-dom";
import type { ArchivedMessage } from "../../archive-api-types";
import { ContactAvatar } from "../../shared/contact-avatar";

/**
 * Danh thiếp như Zalo: nền xanh, avatar + tên + số điện thoại (nếu người gửi kèm), mã QR bên phải. Không có
 * nút "Kết bạn" (kho không gửi lời mời kết bạn); người đó có hội thoại trong kho thì có nút mở hội thoại.
 * Ảnh là link CDN Zalo đã lọc ở máy chủ, không gửi Referer.
 */
export function MessageContactCard({ card }: { card: NonNullable<ArchivedMessage["contactCard"]> }) {
  const [qrFailed, setQrFailed] = useState(false);
  return (
    <div className="w-[320px] max-w-full overflow-hidden rounded-lg border border-black/5 bg-bubble shadow-[0_1px_1px_rgba(0,0,0,0.05)] dark:border-white/5">
      <div className="flex min-h-[136px] gap-3 bg-gradient-to-br from-[#0068ff] to-[#3d8bff] p-4 text-white">
        <div className="h-fit shrink-0 self-start rounded-full ring-2 ring-white/80">
          <ContactAvatar name={card.name} seed={card.userId} url={card.avatarUrl} size="lg" />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <div className="line-clamp-2 text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{card.name}</div>
          {card.phone && <div className="mt-0.5 text-[14px] tabular-nums text-white/85">{card.phone}</div>}
        </div>
        {card.qrUrl && !qrFailed && (
          <img
            src={card.qrUrl}
            alt={`Mã QR Zalo của ${card.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setQrFailed(true)}
            className="h-[84px] w-[84px] shrink-0 self-end rounded-md bg-white p-1"
          />
        )}
      </div>
      {card.threadId ? (
        <Link
          to={`/threads/${encodeURIComponent(card.threadId)}`}
          className="block py-2.5 text-center text-[14.5px] font-medium text-chat-ink hover:bg-black/[0.04] dark:hover:bg-white/5"
        >
          Mở hội thoại
        </Link>
      ) : (
        <div className="py-2 text-center text-[12.5px] text-chat-time">Danh thiếp</div>
      )}
    </div>
  );
}
