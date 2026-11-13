import type { CSSProperties, ReactNode } from "react";
import type { TextStyleSpan } from "../../archive-api-types";
import { buildRichBlocks, buildRichLines, hasLineStyles, type RichList } from "./rich-text-lines";
import { buildRichSegments, shortenLongUrl, type RichSegment, type SegmentStyle } from "./rich-text-segments";

/** Cỡ chữ đúng như Zalo (nền 15px): Nhỏ 13px, Lớn 18px, Rất lớn 20px */
const SIZE_CLASS = { small: "text-[13px]", big: "text-[18px] leading-snug", xbig: "text-[20px] leading-snug" } as const;
/** Mỗi bậc thụt lề (đo trên Zalo: danh sách con lùi thêm 30px so với chữ của mục cha) */
const INDENT_PX = 30;

function segmentClass(s: SegmentStyle): string {
  return [
    s.bold ? "font-semibold" : "",
    // Nhắc tên (@Tên) tô xanh như Zalo
    s.mention ? "text-[#0068ff] dark:text-zalo-600" : "",
    s.italic ? "italic" : "",
    s.underline && s.strike ? "underline line-through" : s.underline ? "underline" : s.strike ? "line-through" : "",
    s.size ? SIZE_CLASS[s.size] : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function renderSegments(segments: RichSegment[]): ReactNode[] {
  return segments.map((seg, i) => {
    const style: CSSProperties | undefined = seg.style.color && !seg.href ? { color: seg.style.color } : undefined;
    const cls = segmentClass(seg.style);
    return seg.href ? (
      <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer nofollow" title={seg.href} className={`text-[#0068ff] hover:underline dark:text-zalo-600 ${cls}`}>
        {shortenLongUrl(seg.text)}
      </a>
    ) : cls || style ? (
      <span key={i} className={cls} style={style}>
        {seg.text}
      </span>
    ) : (
      seg.text
    );
  });
}

/**
 * Danh sách như Zalo Web (đo DOM): thẻ ul / ol thật, cách trên dưới 15px, chữ lùi 40px, dấu tròn đặc / số thứ tự do trình duyệt
 * vẽ (chép tin không dính dấu vào chữ, dán lại vào khung soạn vẫn ra danh sách); danh sách con lùi thêm 30px, không cách dòng.
 */
function RichListView({ list, nested = false }: { list: RichList; nested?: boolean }) {
  const Tag = list.type === "number" ? "ol" : "ul";
  return (
    <Tag className={`${list.type === "number" ? "list-decimal" : "list-disc"} ${nested ? "my-0 pl-[30px]" : "my-[15px] pl-10"}`}>
      {list.items.map((item, i) => (
        <li key={i} className={`whitespace-pre-wrap ${item.line ? "" : "list-none"}`}>
          {item.line && (item.line.segments.length > 0 ? renderSegments(item.line.segments) : <br />)}
          {item.sublists.map((sub, k) => (
            <RichListView key={k} list={sub} nested />
          ))}
        </li>
      ))}
    </Tag>
  );
}

/**
 * Chữ của một tin như Zalo: giữ xuống dòng, hiện đậm / nghiêng / màu / cỡ chữ người gửi đã đặt, danh sách gạch đầu dòng /
 * đánh số và thụt lề, link http(s) bấm được (mở tab mới, không gửi Referer; link rất dài hiện rút gọn ở giữa). Không dùng
 * HTML của tin: mọi thứ dựng từ chữ thuần + danh sách định dạng đã lọc.
 */
export function RichMessageText({ text, styles }: { text: string; styles: TextStyleSpan[] }) {
  if (hasLineStyles(styles)) {
    return (
      // Dòng cao 22px như tin định dạng của Zalo; mỗi dòng thường là một khối, dòng thụt lề mang data-zl-indent để dán lại giữ bậc
      <div className="leading-[22px] [overflow-wrap:anywhere]">
        {buildRichBlocks(buildRichLines(text, styles)).map((b, i) =>
          b.kind === "list" ? (
            <RichListView key={i} list={b.list} />
          ) : (
            <div key={i} className="whitespace-pre-wrap" style={b.line.indent ? { paddingLeft: b.line.indent * INDENT_PX } : undefined} data-zl-indent={b.line.indent || undefined}>
              {b.line.segments.length > 0 ? renderSegments(b.line.segments) : <br />}
            </div>
          ),
        )}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{renderSegments(buildRichSegments(text, styles))}</p>;
}
