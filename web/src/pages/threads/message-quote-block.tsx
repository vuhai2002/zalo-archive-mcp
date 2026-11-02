import type { ArchivedMessage } from "../../archive-api-types";

const BOX = "mb-1.5 block w-full rounded-md border-l-2 border-zalo-500 bg-black/[0.04] px-2 py-1 text-left text-[12.5px] dark:bg-white/5";

/**
 * Ô trích dẫn của tin trả lời, như Zalo: tên người gửi tin gốc + nội dung (tối đa 2 dòng). Tin gốc có trong
 * kho thì bấm được: nhảy tới tin đó trong khung chat (tô nền một lúc), kể cả khi tin nằm xa chưa tải.
 */
export function MessageQuoteBlock({ quote, onJump }: { quote: ArchivedMessage["quote"]; onJump?: (id: number) => void }) {
  if (!quote) {
    return (
      <div className={BOX}>
        <span className="italic text-chat-time">Trả lời một tin</span>
      </div>
    );
  }
  const body = (
    <>
      <div className="font-semibold">{quote.isSelf ? "Bạn" : quote.senderName ?? "Tin nhắn"}</div>
      <div className="line-clamp-2 whitespace-pre-wrap text-chat-time [overflow-wrap:anywhere]">{quote.text}</div>
    </>
  );
  const id = quote.id;
  if (id === null || !onJump) {
    return (
      <div className={BOX} title={id === null ? "Tin gốc không có trong kho" : undefined}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onJump(id)} title="Xem tin gốc" className={`${BOX} cursor-pointer hover:bg-black/[0.08] dark:hover:bg-white/10`}>
      {body}
    </button>
  );
}
