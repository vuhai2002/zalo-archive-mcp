import type { CSSProperties } from "react";
import type { TextStyleSpan } from "../../archive-api-types";
import { buildRichSegments, type SegmentStyle } from "./rich-text-segments";

function segmentClass(s: SegmentStyle): string {
  return [
    s.bold ? "font-semibold" : "",
    // Nhắc tên (@Tên) tô xanh như Zalo
    s.mention ? "text-[#0068ff] dark:text-zalo-600" : "",
    s.italic ? "italic" : "",
    s.underline && s.strike ? "underline line-through" : s.underline ? "underline" : s.strike ? "line-through" : "",
    s.size === "big" ? "text-[17px] leading-snug" : s.size === "small" ? "text-[12.5px]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Chữ của một tin như Zalo: giữ xuống dòng, hiện đậm / nghiêng / màu / cỡ chữ người
 * gửi đã đặt, link http(s) bấm được (mở tab mới, không gửi Referer). Không dùng HTML
 * của tin: mọi thứ dựng từ chữ thuần + danh sách định dạng đã lọc.
 */
export function RichMessageText({ text, styles }: { text: string; styles: TextStyleSpan[] }) {
  const segments = buildRichSegments(text, styles);
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {segments.map((seg, i) => {
        const style: CSSProperties | undefined = seg.style.color && !seg.href ? { color: seg.style.color } : undefined;
        const cls = segmentClass(seg.style);
        return seg.href ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={seg.href}
            className={`text-[#0068ff] hover:underline dark:text-zalo-600 ${cls}`}
          >
            {seg.text}
          </a>
        ) : cls || style ? (
          <span key={i} className={cls} style={style}>
            {seg.text}
          </span>
        ) : (
          seg.text
        );
      })}
    </p>
  );
}
