import { useLayoutEffect, useRef, useState } from "react";

/**
 * Nội dung tin trong Hàng đợi như bong bóng tin mình gửi trong khung chat: dài vừa chữ (tối đa 80% hàng), cắt ở 2 dòng.
 * "Xem thêm" chỉ hiện khi chữ THẬT SỰ bị cắt (đo sau khi vẽ), bấm để mở hết / thu gọn.
 */
export function OutboxMessageBubble({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div className="mt-1.5 max-w-[80%]">
      {/* Khung (nền, viền, đệm) và phần cắt chữ là hai thẻ: cắt ngay trên thẻ có đệm thì nửa dòng thứ 3 lộ ra ở mép dưới */}
      <div className="w-fit max-w-full rounded-lg border border-bubble-self-line bg-bubble-self px-3 py-1.5">
        <p ref={ref} className={`whitespace-pre-wrap text-[14px] leading-[1.45] text-chat-ink [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-2"}`}>
          {text}
        </p>
      </div>
      {(clamped || expanded) && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-0.5 text-[12.5px] font-medium text-zalo-600 hover:underline dark:text-zalo-500">
          {expanded ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}
