import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconThumbUp } from "../../shared/message-action-icons";

/** Sáu cảm xúc nhanh của Zalo - khớp QUICK_REACTIONS phía server (src/outbox/reaction-sender-loop.ts) */
export const QUICK_REACTIONS: Array<{ code: string; emoji: string; label: string }> = [
  { code: "/-strong", emoji: "👍", label: "Thích" },
  { code: "/-heart", emoji: "❤️", label: "Tim" },
  { code: ":>", emoji: "😆", label: "Haha" },
  { code: ":o", emoji: "😮", label: "Wow" },
  { code: ":-((", emoji: "😭", label: "Khóc" },
  { code: ":-h", emoji: "😡", label: "Giận" },
];
const BAR_W = 268;
/** Rời chuột khỏi nút / thanh một chút mới đóng, để kịp đưa chuột từ nút lên thanh */
const CLOSE_DELAY_MS = 250;

/** Chỗ đặt thanh cảm xúc: ngay trên nút Thích, giữa theo nút, luôn nằm trong cửa sổ (vị trí cố định, khung chat không cắt) */
function barPosition(btn: DOMRect): CSSProperties {
  const left = Math.min(Math.max(8, btn.left + btn.width / 2 - BAR_W / 2), window.innerWidth - BAR_W - 8);
  return { left, bottom: window.innerHeight - btn.top + 6, width: BAR_W };
}

/**
 * Nút Thích ở góc dưới bong bóng như Zalo PC: bấm là thả 👍; rê chuột vào thì hiện thanh 6 cảm xúc phía trên để chọn.
 * Chỉ hiện khi rê vào tin (cha có lớp `group`) hoặc khi thanh đang mở.
 */
export function QuickReactionButton({ onReact }: { onReact: (code: string) => void }) {
  const [barAt, setBarAt] = useState<CSSProperties | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepOpen = () => clearTimeout(closeTimer.current);
  const open = () => {
    keepOpen();
    if (btn.current) setBarAt(barPosition(btn.current.getBoundingClientRect()));
  };
  const closeSoon = () => {
    keepOpen();
    closeTimer.current = setTimeout(() => setBarAt(null), CLOSE_DELAY_MS);
  };
  const react = (code: string) => {
    keepOpen();
    setBarAt(null);
    onReact(code);
  };

  // Cuộn khung chat thì thanh lệch khỏi tin: đóng
  useEffect(() => {
    if (!barAt) return;
    const close = () => setBarAt(null);
    document.addEventListener("scroll", close, true);
    return () => document.removeEventListener("scroll", close, true);
  }, [barAt]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <span className="relative" onMouseEnter={open} onMouseLeave={closeSoon}>
      <button
        ref={btn}
        type="button"
        onClick={() => react("/-strong")}
        onFocus={open}
        title="Thích"
        aria-label="Thả cảm xúc Thích"
        className={`flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-bubble text-chat-time shadow-sm transition-opacity hover:text-zalo-500 dark:border-white/10 ${
          barAt ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        }`}
      >
        <IconThumbUp size={14} />
      </button>
      {barAt && (
        <span
          role="menu"
          aria-label="Chọn cảm xúc"
          style={barAt}
          onMouseEnter={keepOpen}
          onMouseLeave={closeSoon}
          className="fixed z-50 flex items-center justify-between rounded-full border border-line bg-surface px-2.5 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
        >
          {QUICK_REACTIONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="menuitem"
              title={r.label}
              aria-label={`Thả cảm xúc ${r.label}`}
              onClick={() => react(r.code)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[26px] leading-none transition-transform hover:scale-125"
            >
              {r.emoji}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
